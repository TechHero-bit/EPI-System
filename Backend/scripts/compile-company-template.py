"""Compile the native Excel print and its measured fields into a portable asset."""
import base64
import json
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[2]
folder = root / 'dist' / 'company-template'
with pdfplumber.open(folder / 'base.pdf') as pdf:
    if len(pdf.pages) != 1:
        raise ValueError('O modelo-base deve caber em uma página.')
    page = pdf.pages[0]
    edges = page.edges
    left = min(edge['x0'] for edge in edges)
    right = max(edge['x1'] for edge in edges)
    top = min(edge['top'] for edge in edges)
    bottom = max(edge['bottom'] for edge in edges)
    bounds = dict(left=left, top=top, width=right-left, height=bottom-top,
                  pageWidth=page.width, pageHeight=page.height)
    required = ['LEGENDA', 'M.D.', 'Risco', 'RECEBIMENTO']
    text = page.extract_text() or ''
    label = next(word for word in page.extract_words(extra_attrs=['size']) if word['text'].startswith('Funcion'))
    font_scale = label['size'] / 12
    if not all(word in text for word in required):
        raise ValueError('A impressão não preservou o cabeçalho completo.')

geometry = json.loads((folder / 'geometry.json').read_text(encoding='utf-8-sig'))
scale_x, scale_y = bounds['width'] / geometry['width'], bounds['height'] / geometry['height']
if not (.4 < scale_x < 1 and .4 < scale_y < 1):
    raise ValueError(f'Escala inesperada da impressão: {scale_x}, {scale_y}')
asset = dict(
    source=json.loads((folder / 'source.json').read_text(encoding='utf-8')),
    bounds=bounds, geometry=geometry, fontScale=font_scale,
    workbookBase64=base64.b64encode((folder / 'base.xlsx').read_bytes()).decode(),
    pdfBase64=base64.b64encode((folder / 'base.pdf').read_bytes()).decode(),
)
target = root / 'Backend' / 'src' / 'assets' / 'company-form-2026.ts'
target.write_text(
    '// Generated from the company workbook and its native Excel print.\n'
    '// Rebuild with Backend/scripts/{prepare,export,compile}-company-template.\n'
    'export const companyForm2026 = ' + json.dumps(asset, ensure_ascii=False, separators=(',', ':')) + ' as const;\n',
    encoding='utf-8',
)
print(json.dumps(dict(bounds=bounds, scale=scale_x, generated=str(target)), ensure_ascii=False))
