#!/usr/bin/env python3
"""
批量调整节日封面图片尺寸，从原尺寸改为 1300x400 (3.25:1)
适应竖屏显示比例（宽度=屏幕宽，高度=120px）

处理方法：
1. 保持图片比例，裁剪到 3.25:1
2. 然后缩放到 1300x400
"""

import os
from PIL import Image

def resize_holiday_cover(file_path, method='crop'):
    """
    调整节日封面图片尺寸
    method: 'crop' (裁剪) 或 'stretch' (拉伸)
    """
    img = Image.open(file_path)
    width, height = img.size
    
    print("Processing: " + os.path.basename(file_path))
    print("  Original size: " + str(width) + "x" + str(height))
    
    if method == 'crop':
        # 裁剪到 3.25:1 比例
        target_ratio = 1300 / 400
        current_ratio = width / height
        
        if current_ratio > target_ratio:
            # 图片太宽，裁剪宽度
            new_width = int(height * target_ratio)
            left = (width - new_width) // 2
            img = img.crop((left, 0, left + new_width, height))
        else:
            # 图片太高，裁剪高度
            new_height = int(width / target_ratio)
            top = (height - new_height) // 2
            img = img.crop((0, top, width, top + new_height))
        
        # 裁剪后缩放到 1300x400
        img = img.resize((1300, 400), Image.Resampling.LANCZOS)
        print("  Crop + resize to: 1300x400")
    
    else:  # stretch
        # 直接拉伸到 1300x400 (可能变形)
        img = img.resize((1300, 400), Image.Resampling.LANCZOS)
        print("  Stretch to: 1300x400")
    
    # 保存图片（覆盖原文件）
    img.save(file_path)
    print("  [OK] Saved")
    img.close()

def main():
    base_dir = r"D:\hexo\source\images\holidays"
    
    print("=" * 50)
    print("Processing holiday cover images...")
    print("Method: Crop + Resize (keep main content)")
    print("=" * 50)
    
    # 处理所有图片文件
    count = 0
    for file in os.listdir(base_dir):
        if file.endswith(('.webp', '.png', '.jpg', '.jpeg')):
            file_path = os.path.join(base_dir, file)
            try:
                resize_holiday_cover(file_path, method='crop')
                count += 1
            except Exception as e:
                print("  [FAIL] " + str(e))
    
    print("=" * 50)
    print("Done! Processed " + str(count) + " images.")

if __name__ == "__main__":
    main()
