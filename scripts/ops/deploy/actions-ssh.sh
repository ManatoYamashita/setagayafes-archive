# SSH helpers for the GitHub Actions workflows that write to the Sakura server
# (.github/workflows/deploy.yml and rollback.yml; Issue #76). Sourced by bash:
#
#   . scripts/ops/deploy/actions-ssh.sh
#   remote 'sh -s -- <args>' < scripts/ops/deploy/remote-deploy.sh
#   send <file>... <remote folder>
#
# Needs SAKURA_HOST and SAKURA_USER, and the key and known_hosts that the
# workflow wrote to $RUNNER_TEMP/ssh/. The host key is pinned
# (StrictHostKeyChecking=yes); it is never taken from the network on the fly.
#
# The logs of this public repository can be read by anyone. Server output is
# passed through `mask`: the csh start-up line that every login prints
# ("then: then/endif not found.", docs/ops/deploy.md) is dropped, and
# /home/<account>/ is rewritten to ~/ (docs/rules/conventions.md, 8).
# The newer OpenSSH of the GitHub runners also warns on every connection that
# the server has no post-quantum key exchange ("** WARNING: connection is not
# using a post-quantum key exchange algorithm.", three lines). That is about
# the server's OpenSSH 7.9, which this repository cannot change; the lines are
# dropped so that they are not read as server output (Issue #77). OpenSSH ends
# its own messages on stderr with \r\n, hence the [[:space:]]* before the end.

# shellcheck shell=bash

ssh_dir="$RUNNER_TEMP/ssh"
ssh_opts=(
  -F /dev/null
  -i "$ssh_dir/key"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o UserKnownHostsFile="$ssh_dir/known_hosts"
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=30
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
)

mask() {
  sed -E \
    -e '/then: then\/endif not found\./d' \
    -e '/^\*\* WARNING: connection is not using a post-quantum key exchange algorithm\.[[:space:]]*$/d' \
    -e '/^\*\* This session may be vulnerable to "store now, decrypt later" attacks\.[[:space:]]*$/d' \
    -e '/^\*\* The server may need to be upgraded\. See https:\/\/openssh\.com\/pq\.html[[:space:]]*$/d' \
    -e 's#/home/[^/[:space:]]+#~#g'
}

# remote <command>: runs <command> on the server (its login shell is csh, so
# anything beyond a plain command goes through `sh -s` on stdin).
remote() {
  # The command is built here on purpose (only names and stamps this repository made).
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$SAKURA_USER@$SAKURA_HOST" "$1" 2>&1 | mask
  return "${PIPESTATUS[0]}"
}

# send <file>... <remote folder>: copies files into a folder under the
# account's home on the server.
send() {
  local dest=${*: -1}
  local files=("${@:1:$#-1}")
  scp -q "${ssh_opts[@]}" "${files[@]}" "$SAKURA_USER@$SAKURA_HOST:$dest" 2>&1 | mask
  return "${PIPESTATUS[0]}"
}
