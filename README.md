# moka-wangwang

别按！摩卡会叫🐶 —— 点击解压小游戏。玩法对标 [game.tangshuang.net](https://game.tangshuang.net/wangwang/)，主角换成摩卡，计数器为「尾巴卷度」。

## 在线地址

https://dewyue.github.io/moka-wangwang/

## 本地预览

```bash
npx --yes serve -l 5173
# 打开 http://localhost:5173
```

## 替换成你家摩卡

当前 `Image/` 里是临时占位图（原版大狗），请换成摩卡的两张图：

| 文件 | 说明 |
|------|------|
| `Image/moka_close_mouth.png` | 闭嘴 |
| `Image/moka_open_mouth.png` | 张嘴（叫） |

直接放带透明通道的 PNG 即可（无需再抠）。换图后重新生成分享卡数据：

```bash
python3 scripts/build-dog-data.py
```

可选：录摩卡「大 / 狗 / 叫」三段音，再生成 `audio-data.js`（结构见原 `audio-data.js`）。

## 说明

- 音效暂用通用狗叫分段，未含广告。
- 分享卡底部文案为 `moka-wangwang`，上线后可改成真实域名。
