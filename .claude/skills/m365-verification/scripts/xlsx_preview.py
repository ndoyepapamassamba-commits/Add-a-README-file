# Preview helper: one page per sheet (landscape, fit to page), then PDF -> PNG per sheet.
import sys, re, zipfile, subprocess, os, shutil
src, outdir, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(outdir, exist_ok=True)
tmp = os.path.join(outdir, prefix + '-fit.xlsx')
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if re.match(r'xl/worksheets/[^/]+\.xml$', item.filename):
        x = data.decode()
        x = re.sub(r'<pageSetup\b[^>]*/>', '', x)
        if '<pageSetUpPr' in x: x = re.sub(r'<pageSetUpPr\b[^>]*/>', '<pageSetUpPr fitToPage="1"/>', x)
        elif re.search(r'<sheetPr\b[^>]*/>', x): x = re.sub(r'<sheetPr\b([^>]*)/>', r'<sheetPr\1><pageSetUpPr fitToPage="1"/></sheetPr>', x, 1)
        elif '<sheetPr' in x: x = re.sub(r'(</sheetPr>)', r'<pageSetUpPr fitToPage="1"/>\1', x, 1)
        else: x = re.sub(r'(<worksheet\b[^>]*>)', r'\1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', x, 1)
        ps = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/>'
        if '<pageMargins' in x: x = re.sub(r'(<pageMargins\b[^>]*/>)', r'\1' + ps, x, 1)
        else:
            m = re.search(r'<(headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b', x)
            x = x[:m.start()] + '<pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.1" footer="0.1"/>' + ps + x[m.start():] if m else x.replace('</worksheet>', '<pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.1" footer="0.1"/>' + ps + '</worksheet>')
        data = x.encode()
    zout.writestr(item, data)
zout.close()
subprocess.run(['soffice', '--headless', '--norestore', '-env:UserInstallation=file://' + os.environ.get('M365_LO_PROFILE', '/tmp/m365-lo-profile'), '--convert-to', 'pdf', '--outdir', outdir, tmp], capture_output=True, timeout=300)
pdf = tmp[:-5] + '.pdf'
for f in os.listdir(outdir):
    if f.startswith(prefix + '-p') and f.endswith('.png'): os.remove(os.path.join(outdir, f))
subprocess.run(['pdftoppm', '-r', sys.argv[4] if len(sys.argv) > 4 else '70', '-png', pdf, os.path.join(outdir, prefix + '-p')])
print(sorted(f for f in os.listdir(outdir) if f.startswith(prefix + '-p')))
