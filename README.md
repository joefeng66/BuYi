# 布医：单一开发源与本机发布

**网页地址：[joefeng66.github.io/BuYi/](https://joefeng66.github.io/BuYi/)**

唯一开发源是 WikiTCM 的 `41WebApp/源文件/整合版`。`main` 维护已审阅的程序和发布工具；`pages-dist` 保存本机生成的独立成品，不维护第二份开发源码。

`.gitignore` 默认排除所有文件，仅放行已列出的程序、样式、发布工具和许可。公开仓库会公开被提交的源码和历史。`originals/`、`content/`、含原始数据的 `index.html`、`docs/`、私人日志、备份、缓存、测试截图、重复副本及 `dist/` 保持在本机；选定的运行资料只由发布脚本进入产物。旧仓库已有的跟踪文件不会因新 `.gitignore` 自动消失，接入远端前还须检查当前树与历史。

用户于 2026-10-28 同意程序、个人整理数据及此前列出的运行资料公开，并指定版权联系邮箱 `joefeng66@gmail.com`。最新选择替代此前按来源不明而全面排除内容的规则。内容按用户要求包含；保留来源与许可声明，不把联系下架声明当作第三方授权。

原始快照仍包含私人路径和笔记信息，不纳入公开源码。因此公开的工具部分不能单独重建完整网站。不要为云端构建上传整个知识库，也不要用 `git add -f` 绕过源目录的排除。

## 本机生成独立的 dist

在此目录执行：

```sh
python3 scripts/release.py --require-approved
python3 scripts/verify_release.py dist --base-path /BuYi/ --require-approved
python3 -m unittest discover -s tests -p release_test.py -v
```

发布工具使用本目录已有快照与 JSON，不联网，也不自动重新导出笔记。笔记更新和选定数据导出在 Mac 本机完成。产物运行不依赖知识库、Obsidian、本机路径或 CDN。

`build.py` 是开发构建器；发布使用 `scripts/release.py`。它先在新的临时目录构建、清理和验证，再把旧 `dist` 移入忽略目录 `.release-private/` 留存，最后替换成新产物。原始快照、笔记及素材不被改写或删除。失败不替换已有 `dist`，相同输入产生相同文件和哈希。

当前发布范围：

- 包含经方剂量、煎服、变方正文、主治摘要、引文、穴位定位与步骤、经络简介、五行摘录、讲义 PDF、三幅同身寸描线 SVG、376 条内嵌音频和三条纠音。
- 清理私人完整笔记、文件路径、快照指纹和 Obsidian 来源入口，保留文献标题、页码与引用编号。五行的完整私人笔记不进入产物，选定的网页摘录保留。
- PDF 入口直接指向 `/BuYi/` 下的产物资源。模型、标注和音频内嵌，移除会请求缺失文件的回退。
- 保留旧仓库 MIT `LICENSE`，复制 OpenCC 的许可和来源记录，固定模型、Three.js 输入脚本及字体哈希。完整第三方许可另存为 `third-party/` 下的文本文件。
- 关于页和 `CONTENT-NOTICE.txt` 提供资料权利说明、侵权更正或下架联系邮箱。代码 MIT 许可不改变第三方资料的权利归属。
- `release-manifest.json` 覆盖全部文件 SHA-256；验证隐私残留、静态资源、文件类型、联系方式及 `/BuYi/` 子路径。

`release-policy.json` 记录用户的发布选择。清单中的 `unverified_rights` 保留此前未找到明确分发许可的资料类别；它不再被当作自动删除内容的理由。`publishable=true` 表示通过用户发布范围、隐私及技术检查，不代表第三方已给予额外授权，也不会自动上传或部署。

`COPYRIGHT-EXCLUSIONS.txt` 沿用历史文件名，现在记录恢复后的发布范围和仍排除的隐私内容，旧版本保存在本机忽略目录。MIT 仅适用于项目自有代码；模型、字体和依赖各循其原许可。

有 Playwright 和隔离 Chrome 的环境可运行 `node tests/release-browser.cjs`。测试只在 `127.0.0.1` 临时提供 `dist`，阻断外网资源，验证资料恢复、PDF、音频控制、三个模块及 `/BuYi/`。结果写入 `.release-private/`。Chromium 检查不代替真实 iPhone Safari 验收，也不证明实际扬声器音质。

## GitHub Pages 流程

`.github/workflows/pages.yml` 仅手动触发，不因推送源码自动部署。它不在云端构建或读取私人笔记，按 GitHub 的[自定义 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)上传静态 artifact 并交给部署任务。

上传及部署流程：

1. 检查最新跟踪清单及旧仓库历史，再把本目录接入现有远端，保留历史而不盲目混入旧发布树。
2. 在 Mac 运行带 `--require-approved` 的构建与验证。
3. 使用一次性的临时 Git 工作目录，把 `dist/` 的内容放在分支根目录，制成只含产物的 `pages-dist` 提交。该分支是生成快照，不是第二份开发源；不包含私人输入、备份或 Git 元数据。
4. 工作流放入默认分支，仓库 Settings → Pages 的来源选择 GitHub Actions。
5. 明确执行部署时，手动输入 `pages-dist` 提交的完整 40 位 SHA。工作流确认它属于该分支并重新验证，再仅上传产物目录。网站地址为 `https://joefeng66.github.io/BuYi/`。
