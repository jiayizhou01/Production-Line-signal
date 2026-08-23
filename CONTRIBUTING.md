# 贡献说明

感谢你考虑为本项目贡献。

## 环境与工作流

- 使用 Node.js 22.13+ 与 pnpm 11.17.0；
- 从小范围改动开始：先开 Issue 说明问题或想法，再提交小型 PR；
- 提交前运行完整验证：

```bash
pnpm run verify:data
pnpm run verify:demo
pnpm run verify:ai-context
pnpm run build
git diff --check
```

## 数据与隐私红线

- 不提交真实工厂数据、个人信息、Token、浏览器 IndexedDB 导出或含敏感信息的截图；
- 演示数据必须保持匿名与虚构。

## 业务口径与数据结构

- 修改 KPI 公式必须在 PR 中说明制造口径、影响的页面与验证方法；
- 修改数据结构必须提供非破坏性迁移，不得清空用户已有数据。

## 视觉与许可证

- 视觉修改应保持现有纸张、墨黑与电黄色设计体系；
- 本项目采用 PolyForm Noncommercial License 1.0.0（非商业公开源码），贡献不改变许可证。
