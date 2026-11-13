"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("prismDesktop", {
  isDesktop: true,
  platform: process.platform,
  pickMusicFolder: (debugPath) => ipcRenderer.invoke("prism:pick-music-folder", debugPath),
  pickBackgroundImages: (debugPaths) => ipcRenderer.invoke("prism:pick-background-images", debugPaths),
  searchUnsplash: (payload) => ipcRenderer.invoke("prism:unsplash-search", payload),
  searchLyrics: (payload) => ipcRenderer.invoke("prism:search-lyrics", payload),
  translateLyrics: (payload) => ipcRenderer.invoke("prism:translate-lyrics", payload),
  extractCover: (filePath) => ipcRenderer.invoke("prism:extract-cover", filePath),
  extractCoverBuffer: (payload) => ipcRenderer.invoke("prism:extract-cover-buffer", payload),
  savePlaylist: (payload) => ipcRenderer.invoke("prism:save-playlist", payload),
  restorePlaylist: () => ipcRenderer.invoke("prism:restore-playlist"),
});
