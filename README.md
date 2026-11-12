# Prism_pmp

**PRISM 粒子音乐播放器** · Windows 10 / 11（64 位）免安装版。

一个把音乐变成星尘的本地桌面播放器：径向频谱粒子、随机背景、自定义图片、待办清单、三组界面控制和本地音乐导入。

![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D4)
![Version](https://img.shields.io/badge/version-v1.1.0-8EF4FF)

## 下载

**[下载 Prism_pmp_v1.1.0.zip](https://github.com/Nvse1337/Prism_pmp/releases/download/v1.1.0/Prism_pmp_v1.1.0.zip)**

- 文件大小：164.7 MB
- SHA-256：`FAEA6F4D4D9D7415062499E0CB508C192C1491C7A7A7C2F0496B57320DB03A77`
- Release：https://github.com/Nvse1337/Prism_pmp/releases/tag/v1.1.0

## v1.1.0 新增

- 左上角三个界面按钮：
  - `Aa`：80%–120% 调整界面与字体大小
  - 眼睛：纯视觉模式，只显示背景与粒子（`H` 切换，`Esc` 恢复）
  - `A` 色点：字体颜色预设与自定义取色
- 界面缩放和字体颜色自动保存，下次启动继续生效。

## 使用

1. 下载 ZIP 并完整解压到任意文件夹。
2. 打开 `Prism_pmp` 文件夹，双击 `PRISM.exe`。
3. 无需安装，不会打开浏览器，也不会启动 localhost 服务器。
4. 如果 Windows SmartScreen 提示未知发布者，点击“更多信息” → “仍要运行”。

详细操作见压缩包内的 `使用说明.txt`。

## 功能

- 10 张随机背景，支持导入自定义图片
- 径向频谱粒子：中心映射高频、外沿映射低频
- 本地音乐单文件 / 文件夹导入
- 待办清单与透明度调节
- 粒子运动强度、同色系渐变颜色
- 界面/字体缩放、纯视觉模式、字体颜色
- 播放列表与待办保存，下次启动自动恢复

用户数据保存在 `%APPDATA%\PRISM`。音乐和自定义背景引用原始文件路径，不会上传或复制。

## 说明

应用未购买代码签名证书，因此 Windows 可能显示 SmartScreen 提示。内置 Unsplash 图片遵循 Unsplash License；内置演示音乐由 PRISM 原创合成。