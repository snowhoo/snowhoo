import sys
sys.path.insert(0, 'D:\\pythonlibs')
import olefile, struct

fname = 'D:\\administrator\\Desktop\\商业保密培训.ppt'
ole = olefile.OleFileIO(fname)
data = ole.openstream('PowerPoint Document').read()
ole.close()

texts = []
i = 0
while i < len(data) - 8:
    rec_ver_inst = struct.unpack_from('<H', data, i)[0]
    rec_type = struct.unpack_from('<H', data, i+2)[0]
    rec_len = struct.unpack_from('<I', data, i+4)[0]
    
    if rec_type == 0x0FA0 and rec_len > 0 and rec_len < 20000:
        text_start = i + 8
        if text_start + rec_len * 2 <= len(data):
            try:
                text = data[text_start:text_start+rec_len*2].decode('utf-16-le')
                if text.strip() and len(text.strip()) > 1:
                    texts.append(text.strip())
            except:
                pass
    i += 1

def clean_text(t):
    clean = ''
    for ch in t:
        uc = ord(ch)
        if (0x4e00 <= uc <= 0x9fff) or (0x3000 <= uc <= 0x303f) or (0xff00 <= uc <= 0xffef) or (0x20 <= uc <= 0x7e):
            clean += ch
    return clean.strip()

print('Total text fragments:', len(texts))
print()

for idx, t in enumerate(texts):
    clean = clean_text(t)
    if clean and len(clean) > 2:
        print(f'=== [{idx}] ({len(clean)} chars) ===')
        print(clean[:1000])
        print()
