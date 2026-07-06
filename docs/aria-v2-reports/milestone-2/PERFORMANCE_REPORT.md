# Aria AI v2 - Milestone 2 Performance Report

- **Stateless Orchestration**: Swarm memory is persisted off-heap into Drizzle/Supabase, preventing long-running Node.js process bottlenecks during concurrent high-traffic routing.
- **Payload Overheads**: Multi-agent coordination requires passing the compressed context graph rapidly; memory clone operations use native `JSON.parse(JSON.stringify(payload))` which is fast enough for context blobs under 2MB.
