#!/usr/bin/env python3
"""Photo pipeline for realtimeintelligence.io.

  python scripts/photos.py sheets   -> search Openverse (commercial-use CC licenses), write candidate
                                       contact sheets + metadata under photos/_cand/
  python scripts/photos.py fetch    -> download the photos listed in photos/manifest.json, resize,
                                       write photos/*.jpg and photos/credits.json

Runs in GitHub Actions (see .github/workflows/photos.yml) where the runner has open internet.
"""
import io, json, os, re, sys, time
import requests
from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PH = os.path.join(ROOT, 'photos')
H = {'User-Agent': 'realtimeintelligence-site/1.0 (+https://realtimeintelligence.io; ayhansebin@gmail.com)'}
OK_LIC = {'cc0', 'pdm', 'by', 'by-sa'}
BAD = re.compile(r'museum|library|archive|gallery|smithsonian|nypl|europeana|getty|met\b|rijks|phylopic|svgsilh|clipart', re.I)

QUERIES = [
    'cement plant', 'cement kiln', 'steel mill', 'steel plant', 'factory interior', 'industrial plant',
    'manufacturing line', 'control room', 'industrial pipes', 'heavy industry night', 'chemical plant',
    'supermarket', 'grocery store', 'retail store', 'shopping aisle', 'store shelves', 'warehouse',
    'checkout counter', 'shopping cart',
    'bank', 'stock exchange', 'trading floor', 'finance', 'stock market', 'credit card', 'atm',
    'financial district', 'wall street', 'bank vault',
    'cell tower', 'telecom tower', 'substation', 'power lines', 'data center', 'server room',
    'container port', 'oil refinery', 'wind turbines',
]


def get(url, **kw):
    for i in range(3):
        try:
            r = requests.get(url, headers=H, timeout=40, **kw)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                time.sleep(5 + 5 * i)
        except Exception:
            time.sleep(2)
    return None


def search(q, pages=2):
    res = []
    for page in range(1, pages + 1):
        r = get('https://api.openverse.org/v1/images/',
                params={'q': q, 'license_type': 'commercial', 'category': 'photograph', 'page_size': 20, 'page': page})
        if not r:
            break
        try:
            res += r.json().get('results', [])
        except Exception:
            break
        time.sleep(0.6)
    good = []
    for x in res:
        if x.get('license') not in OK_LIC:
            continue
        if BAD.search((x.get('source') or '') + ' ' + (x.get('creator') or '') + ' ' + (x.get('title') or '')):
            continue
        w, h = x.get('width') or 0, x.get('height') or 0
        if w and h and w < h:  # landscape only
            continue
        good.append({k: x.get(k) for k in ('id', 'title', 'creator', 'creator_url', 'license', 'license_version',
                                           'license_url', 'source', 'provider', 'url', 'thumbnail',
                                           'foreign_landing_url', 'width', 'height', 'attribution')})
    return good[:24]


def sheets():
    out = os.path.join(PH, '_cand')
    os.makedirs(out, exist_ok=True)
    TW, TH, COLS = 300, 200, 4
    index = {}
    for q in QUERIES:
        good = search(q)
        index[q] = good
        thumbs = []
        for i, x in enumerate(good):
            im = None
            r = get(x['thumbnail'] or x['url'])
            if r:
                try:
                    im = Image.open(io.BytesIO(r.content)).convert('RGB')
                except Exception:
                    im = None
            if im is None:
                im = Image.new('RGB', (TW, TH), (40, 40, 40))
            im = ImageOps.fit(im, (TW, TH), Image.LANCZOS)
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 34, 20], fill=(0, 0, 0))
            d.text((6, 4), str(i), fill=(255, 230, 0))
            lic = (x['license'] or '').upper()
            d.rectangle([TW - 70, 0, TW, 20], fill=(0, 0, 0))
            d.text((TW - 66, 4), lic + ' ' + str(x.get('width') or '?'), fill=(180, 220, 255))
            thumbs.append(im)
        rows = max(1, (len(thumbs) + COLS - 1) // COLS)
        sheet = Image.new('RGB', (COLS * TW, rows * TH), (0, 0, 0))
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % COLS) * TW, (i // COLS) * TH))
        fn = q.replace(' ', '_')
        sheet.save(os.path.join(out, fn + '.jpg'), quality=72, optimize=True)
        print('sheet', q, len(good), flush=True)
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)


def flickr_variants(url):
    m = re.match(r'(https://live\.staticflickr\.com/\d+/\d+_[0-9a-f]+)_([a-z0-9]+)\.(jpg|png)$', url)
    if not m:
        return [url]
    base, ext = m.group(1), m.group(3)
    return [f'{base}_k.{ext}', f'{base}_h.{ext}', f'{base}_b.{ext}', url]


def fetch():
    man = json.load(open(os.path.join(PH, 'manifest.json')))
    credits = []
    for p in man['photos']:
        name = p['name']
        src = None
        for u in flickr_variants(p['url']):
            r = get(u)
            if r and r.headers.get('content-type', '').startswith('image'):
                src = (u, r.content)
                break
        if not src:
            print('FAILED', name, p['url'], flush=True)
            continue
        im = Image.open(io.BytesIO(src[1]))
        im = ImageOps.exif_transpose(im).convert('RGB')
        w, h = im.size
        # optional crop box as fractions: [left, top, right, bottom]
        if p.get('crop'):
            l, t, r_, b = p['crop']
            im = im.crop((int(w * l), int(h * t), int(w * r_), int(h * b)))
            w, h = im.size
        # fit to the requested aspect ratio (default 16:10), focus point as fraction (default center)
        ar = p.get('aspect', 1.6)
        fx, fy = p.get('focus', [0.5, 0.5])
        if w / h > ar:
            tw, th = int(h * ar), h
        else:
            tw, th = w, int(w / ar)
        left = int((w - tw) * fx)
        top = int((h - th) * fy)
        im = im.crop((left, top, left + tw, top + th))
        for width, suffix in ((1800, ''), (900, '-s')):
            if im.width > width:
                s = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
            else:
                s = im.copy()
            s.save(os.path.join(PH, f'{name}{suffix}.jpg'), quality=78, optimize=True, progressive=True)
        credits.append({'name': name, 'title': p.get('title'), 'creator': p.get('creator'), 'license': p.get('license'),
                        'source_url': p.get('landing'), 'file_url': src[0]})
        print('ok', name, im.size, src[0], flush=True)
    json.dump(credits, open(os.path.join(PH, 'credits.json'), 'w'), indent=1)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'fetch'
    {'sheets': sheets, 'fetch': fetch}[mode]()
