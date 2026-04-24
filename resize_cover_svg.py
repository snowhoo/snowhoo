#!/usr/bin/env python3
"""
批量修改封面 SVG 尺寸，从 800x400 (2:1) 改为 1300x400 (3.25:1)
适应竖屏显示比例（宽度=屏幕宽，高度=120px）

修改内容：
1. width: 800 -> 1300
2. viewBox: "0 0 800 400" -> "0 0 1300 400"
3. 调整所有坐标和尺寸，从 800 坐标系映射到 1300 坐标系
"""

import re
import os
import sys

# 缩放比例
SCALE_X = 1300 / 800  # 1.625

def resize_svg(file_path):
    """修改单个 SVG 文件的尺寸"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. 修改 width 属性
    content = re.sub(r'width="800"', 'width="1300"', content)
    
    # 2. 修改 viewBox
    content = re.sub(r'viewBox="0 0 800 400"', 'viewBox="0 0 1300 400"', content)
    
    # 3. 修改所有 <rect> 的 width 属性
    content = re.sub(r'<rect width="800"', '<rect width="1300"', content)
    
    # 4. 缩放 cx 属性 (圆心 x 坐标)
    def scale_cx(match):
        val = float(match.group(1))
        new_val = round(val * SCALE_X, 2)
        return 'cx="' + str(new_val) + '"'
    
    content = re.sub(r'cx="(\d+(?:\.\d+)?)"', scale_cx, content)
    
    # 5. 缩放 text 的 x 属性
    def scale_x(match):
        val = float(match.group(1))
        new_val = round(val * SCALE_X, 2)
        return 'x="' + str(new_val) + '"'
    
    content = re.sub(r'(<text[^>]*) x="(\d+(?:\.\d+)?)"', lambda m: m.group(1) + ' x="' + str(round(float(re.search(r'x="(\d+(?:\.\d+)?)"', m.group(0)).group(1)) * SCALE_X, 2)) + '"', content)
    
    # 更简单的方法：直接替换所有 x="数字" (但要排除 viewBox、width、height 等)
    # 只替换 <text> 和 <rect> 标签中的 x 属性
    for tag in ['text', 'rect', 'circle', 'ellipse']:
        pattern = r'(<' + tag + r'[^>]*) x="(\d+(?:\.\d+)?)"'
        def replace_x(m):
            val = float(m.group(2))
            new_val = round(val * SCALE_X, 2)
            return m.group(1) + ' x="' + str(new_val) + '"'
        content = re.sub(pattern, replace_x, content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("已处理: " + os.path.basename(file_path))

def main():
    base_dir = r"D:\hexo\source\images"
    
    print("开始处理封面 SVG 文件...")
    print("缩放比例: " + str(round(SCALE_X, 3)) + ":1 (800 -> 1300)")
    print("-" * 50)
    
    # 处理节气目录
    solar_dir = os.path.join(base_dir, "solar-terms")
    if os.path.exists(solar_dir):
        for file in os.listdir(solar_dir):
            if file.endswith('.svg'):
                resize_svg(os.path.join(solar_dir, file))
    
    # 处理名言目录
    quotes_dir = os.path.join(base_dir, "quotes")
    if os.path.exists(quotes_dir):
        for file in os.listdir(quotes_dir):
            if file.endswith('.svg'):
                resize_svg(os.path.join(quotes_dir, file))
    
    # 处理根目录下的 hotnews-*.svg
    for file in os.listdir(base_dir):
        if file.startswith('hotnews') and file.endswith('.svg'):
            resize_svg(os.path.join(base_dir, file))
    
    print("-" * 50)
    print("所有 SVG 文件处理完成！")

if __name__ == "__main__":
    main()
