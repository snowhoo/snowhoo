#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hexo 文章批量重命名工具 v3
格式：YYYYMMDDHHMMSS01.md
规则：14 位时间相同的文章，用 01-99 顺序码区分
"""

import os
import re
from datetime import datetime
from pathlib import Path
from collections import defaultdict

def extract_datetime_from_frontmatter(file_path):
    """从 Markdown 文件的 front-matter 中提取完整日期时间"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 匹配 date 字段，支持多种格式
        date_patterns = [
            r'date:\s*(\d{4})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2}):(\d{2})',
            r'date:\s*(\d{4})[-/](\d{2})[-/](\d{2})T(\d{2}):(\d{2}):(\d{2})',
            r'date:\s*(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})',
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, content)
            if match:
                groups = match.groups()
                return f"{groups[0]}{groups[1]}{groups[2]}{groups[3]}{groups[4]}{groups[5]}"
        
        # 如果只有日期没有时间，补充 000000
        date_only = re.search(r'date:\s*(\d{4})[-/](\d{2})[-/](\d{2})\s*$', content, re.MULTILINE)
        if date_only:
            return f"{date_only.group(1)}{date_only.group(2)}{date_only.group(3)}000000"
        
        # 从文件名提取
        filename = os.path.basename(file_path)
        filename_match = re.search(r'(\d{4})[-/]?(\d{2})[-/]?(\d{2})[-/]?(\d{2})[-/]?(\d{2})[-/]?(\d{2})', filename)
        if filename_match:
            return f"{filename_match.group(1)}{filename_match.group(2)}{filename_match.group(3)}{filename_match.group(4)}{filename_match.group(5)}{filename_match.group(6)}"
        
        # 使用文件修改时间
        mtime = os.path.getmtime(file_path)
        return datetime.fromtimestamp(mtime).strftime('%Y%m%d%H%M%S')
    
    except Exception as e:
        print(f"读取文件 {file_path} 出错：{e}")
        return datetime.now().strftime('%Y%m%d%H%M%S')

def rename_hexo_posts(posts_dir):
    """批量重命名 Hexo 文章"""
    posts_path = Path(posts_dir)
    
    if not posts_path.exists():
        print(f"❌ 目录不存在：{posts_dir}")
        return
    
    # 获取所有 .md 文件
    md_files = list(posts_path.glob('*.md'))
    
    if not md_files:
        print("❌ 没有找到 Markdown 文件")
        return
    
    print(f"📁 找到 {len(md_files)} 篇文章\n")
    
    # 提取每篇文章的日期时间信息
    articles = []
    for file_path in md_files:
        datetime_str = extract_datetime_from_frontmatter(file_path)
        articles.append({
            'path': file_path,
            'name': file_path.name,
            'datetime': datetime_str
        })
    
    # 按 14 位时间分组
    time_groups = defaultdict(list)
    for article in articles:
        time_groups[article['datetime']].append(article)
    
    # 对每组内的文章按原文件名排序（保证顺序稳定）
    for dt in time_groups:
        time_groups[dt].sort(key=lambda x: x['name'])
    
    # 生成新文件名
    rename_pairs = []
    for datetime_str in sorted(time_groups.keys()):
        group = time_groups[datetime_str]
        for idx, article in enumerate(group, start=1):
            if idx > 99:
                print(f"⚠️  警告：{datetime_str} 有 {len(group)} 篇文章，超过 99 篇!")
            sequence = f"{idx:02d}"  # 2 位顺序码 (01, 02, 03...)
            new_name = f"{datetime_str}{sequence}.md"
            rename_pairs.append((article['path'], article['path'].parent / new_name))
    
    # 显示重命名计划
    print("=== 重命名计划 ===")
    for i, (old_path, new_path) in enumerate(rename_pairs, start=1):
        print(f"{i:02d}. {old_path.name}")
        print(f"    → {new_path.name}\n")
    
    # 确认执行
    confirm = input(f"确认重命名 {len(rename_pairs)} 个文件？(y/n): ")
    if confirm.lower() != 'y':
        print("已取消")
        return
    
    # 执行重命名
    success_count = 0
    for old_path, new_path in rename_pairs:
        try:
            if new_path.exists():
                print(f"⚠️  跳过 {new_path.name} (已存在)")
                continue
            
            old_path.rename(new_path)
            print(f"✓ {old_path.name} → {new_path.name}")
            success_count += 1
        except Exception as e:
            print(f"✗ 重命名失败 {old_path.name}: {e}")
    
    print(f"\n✅ 完成！成功重命名 {success_count}/{len(rename_pairs)} 个文件")

if __name__ == '__main__':
    default_path = r"D:\hexo\source\_posts"
    
    path_input = input(f"文章目录路径 (默认：{default_path}): ").strip()
    posts_dir = path_input if path_input else default_path
    
    print(f"\n📂 处理目录：{posts_dir}\n")
    rename_hexo_posts(posts_dir)
