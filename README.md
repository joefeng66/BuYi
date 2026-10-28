# 布医 · 静态网页包

这是从个人 WikiTCM 现有网页构建复制出来的静态运行包，可在本机查看，也可通过 GitHub Pages 托管；不包含原始工程、备份或完整私人五行笔记。修改原工程后需要重新构建并更新这个副本，此副本不能单独从原始数据重新构建。

## 本机预览

在此文件夹运行 `python3 -m http.server 8766 --bind 127.0.0.1`，再用浏览器打开 `http://127.0.0.1:8766/`。端口占用时可选其他端口；按 Ctrl+C 停止。此命令仅绑定本机。

## GitHub Pages 设置

此包已有根目录 `index.html`，无需安装依赖或执行构建。

1. 打开仓库的 [Settings → Pages](https://github.com/joefeng66/BuYi/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. **Branch** 选择 `main`，目录选择 **/(root)**，点击 **Save**。
4. 等待仓库 **Actions** 中的 Pages 部署完成，再打开 <https://joefeng66.github.io/BuYi/>。

根目录 `.nojekyll` 使 Pages 直接发布静态文件。后续推送到 `main` 的更新会自动触发部署。可在 iPhone Safari 打开网址，再通过分享菜单添加到主屏幕。

设置依据：[GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 内容与使用说明

- 此副本包含经方、经络和五行的资料摘录及本地整理数据，包含用户确认的加味与剂量记录；逐项确认个人内容和公开范围。不要假设这些资料已获得公开许可。
- `assets/lecture.pdf` 是原讲义副本，只供本机保留并默认在 `.gitignore` 中排除；分享或发布前须确认权利。Git 克隆中没有此文件时，关联 PDF 的入口不可用。
- 五行的「笔记原文」不再包含私人原始笔记；请从个人知识库查看。经络的部分 `obsidian://` 来源链接依赖本地 WikiTCM，不保证在其他设备打开。
- 已保留仓库原有的 MIT `LICENSE` 和 OpenCC 的第三方许可；三维模型、three.js 和字体的已有许可说明仍包含在页面中。书籍、讲义、截图描线及其他素材的授权尚待确认，第三方内容须参考各自许可。
- GitHub Pages 可公开内容，不能以私人仓库推断网页也私密。上传仓库与启用 Pages 是两个步骤；此包尚未进行真实 iPhone 测试。
