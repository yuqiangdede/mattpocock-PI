# 跨文档 Skill 的源码证据复用

本目录的 `scripts/evidence_registry.py` 仅使用 Python 标准库，维护一份**带文件指纹的源码位置与事实线索登记表**；它不是 AST/运行分析引擎，也不能证明接口真正启用、SQL 已迁移、业务目标符合需求或服务实际运行。

## 记录与查询

在目标项目根目录执行，确保证据文件也保存在同一项目中：

```sh
python apps/desktop/resources/skills/_shared/scripts/evidence_registry.py init scratch/source-evidence.json
python apps/desktop/resources/skills/_shared/scripts/evidence_registry.py record scratch/source-evidence.json --source src/Handler.java --line 32 --end-line 35 --snippet @GetMapping --kind java-route --basis candidate --claim "候选接口入口，实际注册待核对" --consumer api-integration-docs:HTTP-001
python apps/desktop/resources/skills/_shared/scripts/evidence_registry.py record scratch/source-evidence.json --source src/Handler.java --line 32 --end-line 35 --snippet @GetMapping --kind java-route --basis candidate --claim "候选接口入口，实际注册待核对" --consumer requirements-spec:REQ-001
python apps/desktop/resources/skills/_shared/scripts/evidence_registry.py check scratch/source-evidence.json --consumer requirements-spec:REQ-001
```

每条记录保留稳定 ID、源码文件/行号/片段、全文件 SHA-256、发现类型、依据层级、备注和消费方。多个 Skill 可引用同一条记录，不再重复复制大段材料。若源文件变化，`check` 返回未通过并列出失效 ID；源文件改动后不能静默更新指纹，必须重新确认来源位置和语义，再显式加 `--refresh`。

## 共享范围与证据边界

- `candidate` 是搜索和扫描得到的线索；`static` 表示已阅读相关源码并判断；`documentation` 是参考文档约定；`runtime` 必须有独立运行记录支撑，CLI 本身**不负责核验这些声明是否属实**。
- 优先共享外部接口入口、DTO 和字段定义、数据库对象及迁移、状态/事件规则、部署配置等明确可定位的事实；使用方须核实其目标版本、条件注册、依赖及业务意图是否一致。
- 共享条目不是需求、设计或接口文档的最终文字。业务合并、实现范围、异常处理和冲突判断仍由对应 Skill 负责。
- 指纹变化只代表需要重新核对，不说明业务语义已改变；反过来，单文件未变也不能证明依赖注册/配置、跨文件链路或生产运行状态不变。
- 不应在证据库中写凭据、令牌、生产敏感样本，不执行源文件中的脚本或宏。对独立复制 Skill 的场景，可用同等 JSON 或结构化人工记录替代公共工具。
