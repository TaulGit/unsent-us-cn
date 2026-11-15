# 背景音乐素材

记录日期：2026-11-15。

## 来源与使用范围

三首音乐由用户通过 **Stable Audio** 按本对话中的提示生成，并以WAV文件提供。本次按用户指令压缩后加入游戏，用于公开仓库与星匣草稿同步。原始WAV保持不变，不收入仓库。

这三首音频属于用户提供素材，**未以MIT重新许可**；仓库其他内容的MIT声明不自动扩展到这三首音乐。本文件记录来源、用途与加工参数。

| 用户提供的源文件名 | 游戏用途 | 项目内文件 |
|---|---|---|
| `Instrumental background music for an intimate Chinese narrat.wav` | 封面与五章调查 | `assets/music/investigation.m4a` |
| `An intimate instrumental soundtrack for two old friends fina.wav` | 六轮重逢对话 | `assets/music/reunion.m4a` |
| `A quiet instrumental ending theme for a Chinese narrative ga.wav` | 三个结局共用 | `assets/music/ending.m4a` |

## 格式与压缩参数

使用macOS系统 `afinfo` 读取源文件、`afconvert` 转码；转码前已核对其帮助与支持格式。三份源文件均为 **44,100Hz、16-bit、双声道PCM WAV**。

输出为 **M4A容器、AAC-LC编码、44,100Hz、双声道**。目标音频码率192,000bit/s，分配策略CBR（`-s 0`），编码质量127（`-q 127`）。保持完整时长、原有声道与源音量，不剪辑音乐。

| 素材 | 有效时长 | 原WAV大小 | M4A大小 | 实测音频码率 |
|---|---:|---:|---:|---:|
| investigation | 180.000秒（3:00） | 31,770,052 bytes | 4,358,489 bytes | 191,996bit/s |
| reunion | 120.000秒（2:00） | 21,186,052 bytes | 2,906,303 bytes | 192,002bit/s |
| ending | 90.000秒（1:30） | 15,894,052 bytes | 2,182,266 bytes | 192,008bit/s |

三个运行时文件合计 **9,447,058 bytes，约9.01MiB**。原WAV合计68,850,156 bytes，运行时素材体积减少约86.3%。

等价转码命令，其中 `INPUT.wav` 替换为对应源文件：

```bash
afconvert -f m4af -d 'aac @44100' -b 192000 -s 0 -q 127 \
  INPUT.wav assets/music/investigation.m4a
```

## 音量检查

以下为源PCM的全曲样本峰值与RMS，RMS数值不是LUFS响度：

| 素材 | 样本峰值 | 全曲RMS | 达到整数满幅的样本 |
|---|---:|---:|---:|
| investigation | -0.79dBFS | -16.67dBFS | 0 |
| reunion | 0.00dBFS | -16.72dBFS | 1,536，占0.014512% |
| ending | -0.09dBFS | -17.08dBFS | 0 |

三首平均电平接近。重逢曲在源文件中有少量峰值触顶，已向主开发流程报告；本次保持素材原貌。游戏播放混音应留出余量，避免音乐与环境层相加后过载。

## 音乐与雨声分层

这三个文件承担背景配乐：封面与调查使用 `investigation`，进入重逢切换为 `reunion`，进入任一结局切换为 `ending`。

雨声作为单独的程序化环境层，仅由“声音”应用的试听按钮启停；全局声音开关控制配乐和音效。试听雨声时，音乐降至原音量的45%，试听结束后恢复。旧的程序化背景旋律已经移除，短提示音继续作为交互效果。调查与重逢曲循环，结局曲自然结束；切曲约0.8秒淡入淡出，同场景重绘不重播。广告和页面隐藏时暂停播放位置，恢复时继续。

## 文件验证

三首均完成以下检查：

1. `afinfo` 确认M4A容器、AAC编码、44,100Hz双声道及准确有效时长。
2. 检查M4A中的AudioSpecificConfig：三首均为 `1210`，Audio Object Type为 **2（AAC-LC）**。
3. 使用 `afconvert` 将每份M4A完整解码为临时16-bit PCM CAF，再用 `afinfo` 核对时长及有效帧数；全部成功。临时解码文件已经删除。
4. 比对转码前后的源WAV SHA-256，三份源文件均未改变。运行时文件中未发现本机用户目录路径。

| 素材 | 解码后的有效音频帧数 | 解码后时长 |
|---|---:|---:|
| investigation | 7,938,000 | 180.000秒 |
| reunion | 5,292,000 | 120.000秒 |
| ending | 3,969,000 | 90.000秒 |

浏览器中的切曲、暂停恢复、独立音量控制与星匣播放结果，由游戏集成验证记录另行确认，见 [VERIFICATION.md](VERIFICATION.md)。
