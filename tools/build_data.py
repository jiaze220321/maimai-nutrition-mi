#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
麦麦营养搭配咪 · 数据构建脚本

作用：
1. 校验 MCP 快照 / 过敏原映射 / 猫咪语料的数据结构；
2. 由 MCP 快照派生出固定 fallback 演示数据（data/fallback_data.json）；
3. 为每个 JSON 生成同名 .js 镜像（window.MCD_* ），
   这样双击 index.html（file:// 协议）也能读到数据，无需起本地服务器。

用法：
    python tools/build_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

REQUIRED_ITEM_FIELDS = ("code", "name", "category", "priceYuan", "nutrition", "allergens")
REQUIRED_NUTRITION = ("energyKcal", "proteinG", "fatG", "carbG", "sodiumMg", "sugarG")
VALID_CATEGORIES = {"main", "side", "drink"}
VALID_ALLERGENS = {
    "gluten", "milk", "egg", "soy", "fish", "shellfish",
    "peanut", "treenut", "sesame",
}


def load(name: str) -> dict:
    path = DATA / name
    if not path.exists():
        raise SystemExit(f"[FATAL] 缺少数据文件: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_snapshot(snap: dict) -> list[str]:
    problems: list[str] = []
    items = snap.get("items", [])
    if not items:
        problems.append("items 为空，无法推荐")
    seen_codes = set()
    for idx, item in enumerate(items):
        tag = f"items[{idx}] {item.get('name', '?')}"
        for field in REQUIRED_ITEM_FIELDS:
            if field not in item:
                problems.append(f"{tag} 缺字段 {field}")
        code = item.get("code")
        if code in seen_codes:
            problems.append(f"{tag} productCode 重复: {code}")
        seen_codes.add(code)
        if item.get("category") not in VALID_CATEGORIES:
            problems.append(f"{tag} category 非法: {item.get('category')}")
        price = item.get("priceYuan")
        if not isinstance(price, (int, float)) or price <= 0:
            problems.append(f"{tag} 价格非法: {price}")
        nutrition = item.get("nutrition", {})
        for field in REQUIRED_NUTRITION:
            value = nutrition.get(field)
            if not isinstance(value, (int, float)) or value < 0:
                problems.append(f"{tag} 营养字段非法 {field}: {value}")
        bad_allergens = set(item.get("allergens", [])) - VALID_ALLERGENS
        if bad_allergens:
            problems.append(f"{tag} 未知过敏原: {sorted(bad_allergens)}")
    counts = {c: sum(1 for i in items if i.get("category") == c) for c in VALID_CATEGORIES}
    if min(counts.values()) == 0:
        problems.append(f"分类不全，无法组成「主餐+配餐+饮料」: {counts}")
    return problems


def make_fallback(snap: dict) -> dict:
    fallback = json.loads(json.dumps(snap))
    fallback["dataKind"] = "demo"
    fallback["demoNotice"] = (
        "演示数据：由一次真实 MCP 抓取结果固化的静态副本，仅用于离线试用与演示，"
        "不是实时官方数据，价格、供应情况与营养数值可能已经变化。"
    )
    fallback["source"] = dict(snap.get("source", {}))
    fallback["source"]["snapshotOf"] = snap.get("capturedAt")
    return fallback


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_js(path: Path, global_name: str, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    header = (
        "/* 本文件由 tools/build_data.py 自动生成，请勿手工编辑。\n"
        f"   源数据: {path.stem}.json · 生成器: tools/build_data.py */\n"
    )
    path.write_text(f"{header}window.{global_name} = {body};\n", encoding="utf-8")


def main() -> int:
    snap = load("mcp_snapshot.json")
    allergen_map = load("allergen_map.json")
    cat_lines = load("cat_lines.json")

    problems = validate_snapshot(snap)
    if problems:
        print("[FAIL] 数据校验未通过：")
        for p in problems:
            print("  -", p)
        return 1

    fallback = make_fallback(snap)
    write_json(DATA / "fallback_data.json", fallback)

    write_js(DATA / "mcp_snapshot.js", "MCD_SNAPSHOT", snap)
    write_js(DATA / "fallback_data.js", "MCD_FALLBACK", fallback)
    write_js(DATA / "allergen_map.js", "MCD_ALLERGEN_MAP", allergen_map)
    write_js(DATA / "cat_lines.js", "MCD_CAT_LINES", cat_lines)

    items = snap["items"]
    counts = {c: sum(1 for i in items if i["category"] == c) for c in VALID_CATEGORIES}
    prices = [i["priceYuan"] for i in items]
    print("[OK] 数据校验通过")
    print(f"  商品数: {len(items)}  主餐 {counts['main']} / 配餐 {counts['side']} / 饮料 {counts['drink']}")
    print(f"  价格区间: {min(prices):.1f} - {max(prices):.1f} 元")
    print(f"  快照门店: {snap['source'].get('storeName')} ({snap['source'].get('storeCode')})")
    print(f"  生成文件: fallback_data.json / mcp_snapshot.js / fallback_data.js / allergen_map.js / cat_lines.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
