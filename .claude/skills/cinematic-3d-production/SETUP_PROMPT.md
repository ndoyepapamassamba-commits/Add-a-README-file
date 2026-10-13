# Copy-ready setup prompt

Paste the text below into the coding agent on the machine that will do the work. The agent needs filesystem access and, for installation, permission to use the machine's package manager or application installer. It should ask you only for an unavoidable interactive step, such as Epic sign-in or accepting a license.

```text
Set up the public cinematic-3d-production skill from
https://github.com/Kian-hdr/cinematic-3d-production
on this machine, then verify that it is ready for a real project.

1. Identify this agent's documented skill location and check for an existing
   cinematic-3d-production skill. Preserve any existing version or local edits;
   do not overwrite them. Clone or update the repository into the appropriate
   user-level or project-level skill location. Read SKILL.md and its setup
   reference. Verify that this agent can discover or explicitly load the skill.
2. Inspect the OS, CPU/GPU, graphics drivers, RAM, free storage, existing
   Blender and Unreal Engine installations, project version requirements, and
   video encoder/probe tools. Report actual paths and versions. Check current
   official hardware and installation requirements before selecting versions.
   Ask whether my first project is a still, film, or existing Unreal project if
   that is not already clear; use the answer to select versions and optional
   video tools. State the expected download and disk impact before installing.
3. Install only missing, compatible tools needed for the Blender-to-Unreal
   workflow: Blender, Unreal Engine, and a video encoder/probe such as FFmpeg
   if we plan to make films. Use official downloads or a trusted system package
   manager. Do not change an existing production project's engine version.
   If Epic sign-in, license acceptance, administrator authentication, or a
   download choice needs me, prepare everything else and ask for that exact
   step. Do not buy software, cloud compute, plugins, or subscriptions.
4. Run small, disposable smoke checks: open Blender, save and export a simple
   scene; open the selected Unreal version in a temporary project or safe copy,
   import the asset and render one small frame; for film work, encode, probe,
   and decode a few seconds of video. Avoid touching existing production files.
   Do not report a check as passed if it was not actually run.
5. Report BASELINE READY, PARTLY READY, or BLOCKED, with installed paths/versions,
   passed checks, remaining manual steps, hardware limits, and any estimated
   storage or paid cost. BASELINE READY means the small tool checks passed;
   assess fitness for my actual project after its brief. If baseline ready,
   invoke the skill and interview me briefly about my first still or animation.
   Ask only for decisions not established by what I have already provided,
   then create a concise production brief.

Keep credentials private and out of project uploads. Keep source media local
unless I explicitly choose a delivery destination. Do not publish or upload
a project as part of setup.
```

The prompt is deliberately platform neutral: the agent checks its host and uses supported install routes rather than assuming Homebrew, Windows package tools, a specific Unreal version, or an already authenticated Epic account.
