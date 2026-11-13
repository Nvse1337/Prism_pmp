# Prism_pmp

**PRISM 粒子音乐播放器** · Windows 10 / 11（64 位）免安装版。

一个把音乐变成星尘的本地桌面播放器：径向频谱粒子、随机背景、自定义图片、歌词、待办清单、全屏专辑墙和本地音乐导入。

![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D4)
![Version](https://img.shields.io/badge/version-v1.2.0-8EF4FF)

## 下载

**[下载 Prism_pmp_v1.2.0.zip](https://github.com/Nvse1337/Prism_pmp/releases/download/v1.2.0/Prism_pmp_v1.2.0.zip)**

- 文件大小：164.7 MB
- SHA-256：`85EBB1A6012A1785F2BE7D1321BABF917518FF4B7E894B1674AAE6FDBE1062D4`
- Release：https://github.com/Nvse1337/Prism_pmp/releases/tag/v1.2.0

## v1.2.0 新增

- **歌词显示**：导入 `.lrc`，支持拖动定位、字体、颜色、字号、透明度、显示开关，并按歌曲保存。
- **全屏专辑墙**：大幅专辑封面铺满屏幕，悬停边缘发光，拖拽排序，点击播放。
- **Unsplash 在线背景**：独立「背景设置」面板，填写 Access Key 后按关键词随机检索并添加一张背景；Key 输入后自动保存。
- **背景设置独立**：自定义背景 / Unsplash 从粒子设置中移出，入口在右上角图片齿轮按钮。
- 保留界面缩放、纯视觉模式、字体颜色、待办、播放列表保存等功能。

## 使用

1. 下载 ZIP 并完整解压到任意文件夹。
2. 打开 `Prism_pmp` 文件夹，双击 `PRISM.exe`。
3. 无需安装，不会打开浏览器，也不会启动 localhost 服务器。
4. 如果 Windows SmartScreen 提示未知发布者，点击“更多信息” → “仍要运行”。

详细操作见压缩包内的 `使用说明.txt`。

## 功能

- 10 张随机背景，支持本地自定义图片和 Unsplash 在线检索
- 径向频谱粒子：中心映射高频、外沿映射低频
- 本地音乐单文件 / 文件夹导入
- 歌词显示与 LRC 导入
- 全屏专辑墙与拖拽排序
- 待办清单与透明度调节
- 粒子运动强度、同色系渐变颜色
- 界面/字体缩放、纯视觉模式、字体颜色
- 播放列表与待办保存，下次启动自动恢复

用户数据保存在 `%APPDATA%\PRISM`。音乐和本地自定义背景引用原始文件路径，不会上传或复制；Unsplash 在线背景使用热链，需要联网。

## 说明

应用未购买代码签名证书，因此 Windows 可能显示 SmartScreen 提示。内置 Unsplash 图片遵循 Unsplash License；在线图片使用官方 API 热链并显示署名；内置演示音乐由 PRISM 原创合成。