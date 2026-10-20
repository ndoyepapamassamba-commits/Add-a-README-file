# Cost-efficient production

Optimize total cost and time per accepted revision, including human review, AI work, rendering, saving, encoding, transfer, and rework. Faster frames alone do not establish a faster project.

- Use a deterministic controller or the existing render queue for routine progress, bounded retries, encoding, and technical checks. Stop on unknown errors with compact diagnostics. Keep complete logs on disk and review only relevant excerpts.
- Reuse configured scenes, material instances, shot templates, and saved rendering presets. Make routine changes through parameters rather than rebuilding a scene generator for each revision.
- Resolve composition and timing with inexpensive normal-speed previews. Prove temporal effects, thin geometry, color, text, and audio in a short native-format moving sample before bulk output.
- Consolidate feedback into one actionable correction list and evaluate the combined look. Set a bounded experiment when alternatives are uncertain. Preserve selected work and rerender only affected coherent shots.
- Benchmark retained-engine sessions against fresh jobs when startup or shader time matters. Reuse sessions only if memory, scene reset, and temporal history remain reliable.
- Choose local or cloud hardware from representative measurements and an end-to-end estimate. Account for compute, storage, transfer, and recovery inputs. Confirm paid-resource authorization and a stop condition before launch.
- Keep one current brief with source/output paths, active owner, effective recipe, remaining jobs, and open checks. Avoid repeated full-history loading or model calls for routine polling.

Report observed timings and spend separately from estimates. Do not claim savings without a comparable baseline.
