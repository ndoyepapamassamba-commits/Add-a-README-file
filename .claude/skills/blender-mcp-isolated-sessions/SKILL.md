---
name: blender-mcp-isolated-sessions
description: Start and drive your own session-owned Blender MCP instance on a non-default port without touching an already-running Blender or another agent's session. Use when you need Blender MCP but port 9876 is taken, when multiple agents must use Blender concurrently, when you must not disturb a running GUI scene, or when the user says "spin up your own Blender", "isolated Blender", "second Blender MCP instance", "don't touch the running Blender".
category: 3D
upstream: https://github.com/oh-ashen-one/blender-agent-skills
source_license: MIT
triggers:
  - blender mcp
  - session blender isolée
  - blender en arrière-plan
  - piloter blender
  - blender headless
---

# Blender MCP isolated sessions

Own your Blender process. Never borrow, reconfigure, or restart somebody else's.

## The method

1. **Check what's running first.** The Blender MCP addon defaults to port **9876**. If a Blender GUI or another agent's instance is already serving there, that session is off-limits. Multiple isolated instances are fine — each gets its own process, port, and scene.

2. **Spawn a fresh process with factory startup**, passing a bootstrap script:
   ```sh
   blender --factory-startup --python work/start_isolated_blender.py
   ```
   `--factory-startup` guarantees the new process does not inherit the running session's addons, scenes, or preferences — so starting it cannot alter the already-running Blender.

3. **The bootstrap script** (full template in `references/start_isolated_blender.py`):
   - Loads the `blender_mcp` addon **by file path** with `importlib.util.spec_from_file_location` (it is not installed in the factory-startup process's addon path).
   - **Monkey-patches `BlenderMCPServer.start` to a no-op before calling `register()`** — otherwise the addon auto-starts its server on the default port 9876 during registration and collides with the running session. Restore the real `start` immediately after `register()`.
   - Deletes any stale `bpy.types.blendermcp_server` attribute before creating the new server.
   - Creates and starts its own server on the chosen port (e.g. **9877**), sets the scene's `blendermcp_port` property, and sets `blendermcp_server_running = True`.
   - **Tags the scene with ownership custom properties**: `scene["session_owner"] = "<your-task-name>"`, `scene["mcp_port"] = PORT`. Any later session can inspect these before touching the socket.
   - Prints a single ready token, e.g. `SESSION_OWNED_BLENDER_MCP_READY port=9877`. Grep the process output for that token — do not assume readiness from process spawn.

4. **Drive it with a tiny CLI wrapper** (`references/blender_rpc.py`) using the `blender_mcp.server.BlenderConnection` client pointed at your port. Three subcommands cover everything: `scene-info`, `run-script <path>`, `code "<source>"`.

5. **The run-script trick**: send the file's contents through `execute_code` as
   ```python
   exec(compile(open('/abs/path/stage.py', 'r', encoding='utf-8').read(),
                '/abs/path/stage.py', 'exec'), {'__name__': '__main__'})
   ```
   Setting `__name__` to `'__main__'` makes scripts written with `if __name__ == '__main__':` guards run correctly inside the MCP `execute_code` handler, and `compile()` with the real filename keeps tracebacks pointing at your file.

6. **Verify the connection with live queries**, not launch logs: call `get_scene_info` and confirm the returned scene carries your `session_owner`/`mcp_port` tags. An opened Blender window is not proof of an MCP connection.

## LESSONS LEARNED

- The addon's `register()` **auto-starts a server on 9876 as a side effect**. If you load and register it in a second Blender without suppressing that one call, the second instance either steals the port or errors — and you may have just broken the other session's server. Suppress, register, restore, then start your own.
- Custom scene properties survive saves. Tagging `session_owner` and `mcp_port` turned "which Blender is mine?" from guesswork into one scene query.
- `bpy.types.blendermcp_server` can linger from a previous register/unregister cycle; delete it before assigning your own server or Blender raises on re-registration.
- A separate long-running scene build and an interactive review Blender can coexist happily on one workstation — but only if every session owns its ports and files and nothing reaches into another process's scene.

## FAILURE CATALOG

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Second Blender comes up but MCP calls hit the wrong scene | Addon auto-started on 9876 during `register()`; your client connected to the pre-existing session | Monkey-patch `BlenderMCPServer.start` to no-op before `register()`, restore it, then start your own server on your port (see reference) |
| `RuntimeError: Unable to load Blender MCP addon` on factory startup | Addon is in a user `scripts/addons` dir that `--factory-startup` does not load | Load the addon file by absolute path with `importlib.util` instead of relying on addon discovery |
| `register()` raises on re-run in the same process | Stale `bpy.types.blendermcp_server` from the previous cycle | `if hasattr(bpy.types, "blendermcp_server"): del bpy.types.blendermcp_server` before creating the server |
| Script runs via `execute_code` but its main block never fires | MCP executes your source in its own namespace; `__name__` is not `'__main__'` | Wrap with the `exec(compile(...), {'__name__': '__main__'})` run-script trick |
| Client hangs or connects to nothing | Assumed readiness from process spawn; server not yet listening | Wait for the printed `READY port=NNNN` token, then verify with `get_scene_info` and the scene's owner tags |

## BEST PRACTICES

- One task = one process = one port = one output directory. Record all four in your task notes.
- Pick ports deterministically (9876 + task index) and write them into scene custom props and your README.
- Keep every stage of your build runnable through the CLI wrapper so the whole scene rebuilds from the command line; interactive clicking is not reproducible.
- When finished, close only your own process. Leave other sessions exactly as you found them.
