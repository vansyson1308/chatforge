# Security

## Trust boundaries

Viewer text must use `textContent` or `fillText`, never `innerHTML`. Mods run only in QuickJS with explicit bindings and resource limits. Secrets and runtime state stay out of git.

## Validation and incident handling

Gatekeeper and hardening are planned for M3 and M5; see the brief §3.2 and §3.4.
