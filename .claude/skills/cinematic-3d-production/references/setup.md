# Tool and host readiness

The skill is instructions, not a Blender, Unreal, or media-software installer. Check the user's OS, CPU/GPU, GPU memory, RAM, free storage, graphics drivers, and existing project/engine version before installing or upgrading anything. A project may require its existing engine version; never upgrade it reflexively.

## Required for the default pipeline

| Tool | Purpose | Readiness check |
| --- | --- | --- |
| Blender | Editable modeling, UVs, rigging, and export | Application opens; a small scene can save and export; installed version supports the host |
| Unreal Engine | Scene assembly and final 3D rendering | Correct project opens; target rendering features work; a small frame or short clip can be rendered and saved |
| Storage and graphics support | Source assets, cache, frame sequences, and export | Space and hardware meet the chosen project and installed engine's requirements |

For films, use a working encoder and probe tool such as FFmpeg/ffprobe, or an equivalent editor/exporter that can verify the required media properties. Image-generation, speech, music, cloud GPU, version control, and compositing tools are optional and brief dependent. Do not install unrelated services by default.

Use official sources and the current platform instructions: [Blender downloads](https://www.blender.org/download/), [Blender requirements](https://www.blender.org/download/requirements/), [Unreal installation](https://dev.epicgames.com/documentation/unreal-engine/install-unreal-engine), [Unreal hardware requirements](https://dev.epicgames.com/documentation/unreal-engine/hardware-and-software-specifications-for-unreal-engine), and [FFmpeg downloads](https://ffmpeg.org/download.html). These pages change; verify the selected versions and license terms at setup time. Epic's normal launcher flow requires an account sign-in and acceptance of its agreements. Leave those interactive decisions to the user.

## Ready means tested

1. Record actual paths and versions, not just the presence of installers or launchers.
2. Open the selected Blender and Unreal versions. Test a tiny Blender export/import and a disposable Unreal render in a temporary project or safe copy when practical. Do not disturb an existing production scene.
3. For video, test a short encode, probe, and full decode. Confirm that audio handling works if the brief needs audio.
4. Check that the user's selected agent can read `SKILL.md` and its references. A cloned repository alone does not prove skill discovery in that agent.
5. Report **baseline ready**, **partly ready**, or **blocked** with exact checks and missing steps. Baseline readiness is tool operability; assess fitness for the actual project after its brief. Do not claim a full production pipeline is proven from version output alone.

If hardware cannot support the intended Unreal features, propose a measured local alternative or an authorized cloud route. State estimated spend and stop condition before paid compute. Keep private assets and credentials outside this repository.
