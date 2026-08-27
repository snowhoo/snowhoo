# -*- coding: utf-8 -*-
import os
d = r'D:\hexo\source\js\sevencolor\1\fo_data'
names = ['fo_01_feige','fo_02_nianfo','fo_03_zhouyu','fo_04_niansong',
         'fo_05_jizan','fo_06_fanyue','fo_07_youshengshu','fo_08_jiangzuo']
total = 0
for n in names:
    f = os.path.join(d, n+'.js')
    size = os.path.getsize(f)
    with open(f, 'r', encoding='utf-8') as fp:
        content = fp.read()
        count = content.count('"title"')
        audio = content.count('"audio"')
        cover = content.count('"cover"')
        total += count
        print(f'{n}: {count} items, size={size//1024}KB, audio={audio}, cover={cover}')
print(f'\nTotal: {total} items')