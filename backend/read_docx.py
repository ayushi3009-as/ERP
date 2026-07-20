import sys
import docx

def read_docx(file_path):
    doc = docx.Document(file_path)
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    with open('output.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(full_text))

read_docx(sys.argv[1])
