---
name: agent-skill-helper
description: Assists with creating, managing, testing, and optimizing Agent Skills. Use this skill when you want to define a new skill, write a SKILL.md file, set up evaluations, grade test outputs, run A/B benchmarks, or optimize skill triggering descriptions.
---

# Agent Skill Helper (A to Z Guide)

This skill provides a complete, self-contained guide for creating, testing, grading, benchmarking, and optimizing Agent Skills for Antigravity.

---

## 1. Core Concepts & Skill Structure

### What is a Skill?
A skill is a package of specialized knowledge and instructions that extends what the agent can do in a repeatable way.

### Folder Layout
Skills are structured inside a single folder:
```text
.agents/skills/<skill-name>/
├── SKILL.md       # Main instructions (required)
├── scripts/       # Executable helper scripts (optional)
├── examples/      # Reference code/conversations (optional)
└── resources/     # Templates or static assets (optional)
```

### Where Skills Live
Antigravity supports two scopes:
- **Workspace-specific**: `<workspace-root>/.agents/skills/<skill-folder>/`
- **Global (all workspaces)**: `~/.gemini/config/skills/<skill-folder>/`

*Note: Antigravity defaults to `.agents/skills/` but also maintains backward compatibility for `.agent/skills/`.*

### Progressive Disclosure (Token-Efficiency)
To save tokens, the system uses a progressive loading pattern:
1. **Discovery**: The agent only reads the skill's name and description (frontmatter) at startup.
2. **Activation**: The agent reads the full `SKILL.md` only when it matches the user's request.
3. **Execution**: The agent reads scripts or resources only when explicitly called.

---

## 2. Writing a SKILL.md

Every skill requires a `SKILL.md` starting with YAML frontmatter:

```markdown
---
name: skill-identifier
description: Clear, specific description of what the skill does and when to use it.
---

# Skill Title

Instructions, guidelines, and rules for the agent.
```

### Frontmatter Guidelines:
- **name**: Unique lowercase identifier, using hyphens (e.g., `code-reviewer`).
- **description**: Written in third person. Be specific and slightly "pushy" to ensure the agent recognizes when to trigger it. E.g., *"Reviews Python code changes. Use this skill whenever the user mentions code quality, code reviews, or pull requests, even if they do not explicitly ask for 'code-reviewer'."*

---

## 3. The Development & Testing Workflow

When developing or improving a skill, follow this iterative process:

### Step 1: Capture Intent & Define Test Cases
1. Determine the target goal of the skill, when it triggers, and its expected outputs.
2. Create 2–3 realistic test prompts representing what a user would say.
3. Save these prompts in `evals/evals.json` using the following schema:
```json
{
  "skill_name": "your-skill-name",
  "evals": [
    {
      "id": 0,
      "prompt": "The prompt to test",
      "expected_output": "Description of the expected result",
      "files": []
    }
  ]
}
```

### Step 2: Spawn Runs (With-Skill vs. Baseline)
For each test case, execute two configurations in parallel to compare:
- **With-Skill Run**: Run the prompt with the skill active. Save outputs to `<workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/`.
- **Baseline Run**: 
  - *New Skill*: Run the prompt with no skill active. Save to `without_skill/outputs/`.
  - *Improving Skill*: Run the prompt pointing to a copy of the old skill version. Save to `old_skill/outputs/`.

### Step 3: Capture Performance Data
For every run, record the token usage and duration from the task notification and save it to `timing.json` in the run directory:
```json
{
  "total_tokens": 12345,
  "duration_ms": 15200,
  "total_duration_seconds": 15.2
}
```

### Step 4: Grading & Benchmarking
1. **Grade Runs**: Evaluate outputs against your test assertions. Save results to `grading.json` in each run directory:
```json
{
  "expectations": [
    {
      "text": "The file contains a header",
      "passed": true,
      "evidence": "Found '# Header' on line 1"
    }
  ]
}
```
2. **Aggregate Benchmark**: Run the benchmark aggregation script to create a performance report:
```bash
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
```
3. **Launch the Review Viewer**: Start the static or interactive HTML viewer to inspect outputs side-by-side:
```bash
python <skill-creator-path>/eval-viewer/generate_review.py <workspace>/iteration-N --skill-name "your-skill" --benchmark <workspace>/iteration-N/benchmark.json
```

---

## 4. Description & Trigger Optimization

To ensure the skill triggers perfectly:
1. Generate a test set of 20 queries (10 should-trigger, 10 should-not-trigger).
2. Save them to a JSON file.
3. Run the optimization loop to evaluate the description's accuracy across multiple runs:
```bash
python -m scripts.run_loop --eval-set <path-to-trigger-eval.json> --skill-path <path-to-skill> --model <model-id> --max-iterations 5 --verbose
```
4. Apply the `best_description` returned by the tool to the skill's frontmatter.
