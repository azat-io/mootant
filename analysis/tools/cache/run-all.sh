#!/usr/bin/env bash
# Runs every cache / --incremental / --since scenario and keeps the logs in
# analysis/data/cache/*.log. About 120 runs of tiny fixtures (5-10 minutes on
# a 4 vCPU machine). Requires the templates: run make-templates.sh first.
set -u
here=$(cd "$(dirname "$0")" && pwd)
data=/home/user/mootant/analysis/data/cache
mkdir -p "$data"

"$here/s-inputs.sh" \
  virtual_module virtual_module_import watched_real_module outside_root inside_root \
  node_modules_patch env_config_setting future_mtime future_mtime_dependency \
  write_back_package_json reinstall_stamp error_diagnostic custom_environment \
  volatile_provide volatile_define spawn_star glob_new_file monorepo_workspace mootant_setting \
  snapshot_change setup_file_change mocks_appear dotenv_change \
  env_variable_change move_project renames node_major tsconfig_root_change \
  tsconfig_reference mode_switch \
  nt_outside_root nt_node_modules_patch nt_load_env_file \
  2>&1 | tee "$data/inputs.log"

"$here/s-incremental.sh" \
  property_write_elsewhere test_change unlisted_dependency listed_dependency \
  caller_change \
  2>&1 | tee "$data/incremental.log"

"$here/s-corrupt.sh" truncated tampered directory concurrent interrupted \
  2>&1 | tee "$data/corrupt.log"

"$here/s-since.sh" \
  rename_committed rename_unstaged staged_unstaged_untracked deleted_lines \
  merge_commits shallow_clone unknown_ref odd_paths binary_file tests_only \
  detached_and_worktree merge_conflict symlinks user_config submodule \
  2>&1 | tee "$data/since.log"
