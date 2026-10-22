/* 本文件由 tools/build_data.py 自动生成，请勿手工编辑。
   源数据: allergen_map.json · 生成器: tools/build_data.py */
window.MCD_ALLERGEN_MAP = {
  "schemaVersion": "1.0.0",
  "purpose": "麦当劳 MCP 未提供官方过敏原/忌口字段，本文件用「名称关键词 → 过敏原/忌口标签」的保守映射补齐，仅用于硬过滤，不构成官方过敏原声明。",
  "disclaimer": "关键词映射为启发式规则，可能存在误判或漏判。对严重过敏人群，请以门店与官方包装标注为准。",
  "allergens": [
    {
      "id": "gluten",
      "label": "麸质/小麦",
      "keywords": [
        "堡",
        "卷",
        "派",
        "麦满分",
        "面包",
        "薯饼",
        "面",
        "意面",
        "拉明顿"
      ]
    },
    {
      "id": "milk",
      "label": "牛奶/乳制品",
      "keywords": [
        "牛奶",
        "奶",
        "芝士",
        "吉士",
        "冰淇淋",
        "新地",
        "麦旋风",
        "拿铁",
        "奶铁",
        "卡布奇诺",
        "阿芙佳朵",
        "朱古力",
        "雪冰",
        "奶昔",
        "黄油"
      ],
      "exceptKeywords": [
        "燕麦奶"
      ]
    },
    {
      "id": "egg",
      "label": "鸡蛋",
      "keywords": [
        "蛋",
        "沙拉",
        "蛋黄酱",
        "麦香鸡",
        "鸡排",
        "鸡翅",
        "麦乐鸡"
      ]
    },
    {
      "id": "soy",
      "label": "大豆",
      "keywords": [
        "酱",
        "板烧",
        "照烧",
        "豆"
      ]
    },
    {
      "id": "fish",
      "label": "鱼类",
      "keywords": [
        "鱼",
        "鳕"
      ]
    },
    {
      "id": "shellfish",
      "label": "甲壳类/海鲜",
      "keywords": [
        "虾",
        "蟹",
        "海鲜",
        "贝"
      ]
    },
    {
      "id": "peanut",
      "label": "花生",
      "keywords": [
        "花生"
      ]
    },
    {
      "id": "treenut",
      "label": "坚果",
      "keywords": [
        "坚果",
        "杏仁",
        "核桃",
        "榛",
        "腰果"
      ]
    },
    {
      "id": "sesame",
      "label": "芝麻",
      "keywords": [
        "芝麻",
        "麻酱"
      ]
    }
  ],
  "exclusions": [
    {
      "id": "beef",
      "label": "牛肉",
      "keywords": [
        "牛"
      ],
      "exceptKeywords": [
        "牛奶",
        "牛角包"
      ]
    },
    {
      "id": "pork",
      "label": "猪肉",
      "keywords": [
        "猪",
        "培根",
        "火腿",
        "香肠",
        "图林根"
      ]
    },
    {
      "id": "chicken",
      "label": "鸡肉",
      "keywords": [
        "鸡"
      ]
    },
    {
      "id": "fish",
      "label": "鱼虾海鲜",
      "keywords": [
        "鱼",
        "鳕",
        "虾",
        "蟹"
      ]
    },
    {
      "id": "spicy",
      "label": "辛辣",
      "keywords": [
        "辣",
        "椒盐",
        "咖喱",
        "胡椒"
      ]
    },
    {
      "id": "fried",
      "label": "油炸",
      "keywords": [
        "炸",
        "薯条",
        "薯饼",
        "鸡排",
        "鸡翅",
        "脆汁鸡",
        "麦乐鸡",
        "油条"
      ]
    },
    {
      "id": "caffeine",
      "label": "含咖啡因",
      "keywords": [
        "咖啡",
        "美式",
        "拿铁",
        "奶铁",
        "卡布奇诺",
        "可乐",
        "红茶",
        "茶",
        "浓缩"
      ]
    },
    {
      "id": "dessert",
      "label": "甜品/冰淇淋",
      "keywords": [
        "冰淇淋",
        "新地",
        "麦旋风",
        "派",
        "圆筒",
        "阿芙佳朵",
        "拉明顿"
      ]
    },
    {
      "id": "sugary",
      "label": "含糖饮料",
      "keywords": [
        "可乐",
        "雪碧",
        "汁",
        "橙",
        "柠檬红茶",
        "奶昔",
        "怡泉"
      ]
    }
  ],
  "goals": [
    {
      "id": "fat_loss",
      "label": "减脂",
      "kcalBand": [
        420,
        600
      ]
    },
    {
      "id": "high_protein",
      "label": "高蛋白",
      "kcalBand": [
        500,
        750
      ]
    },
    {
      "id": "low_sodium",
      "label": "低钠",
      "kcalBand": [
        450,
        700
      ]
    },
    {
      "id": "balanced",
      "label": "均衡",
      "kcalBand": [
        500,
        750
      ]
    }
  ]
};
