module.exports = async (kernel) => {
  let env = {
    SD_WEBUI_RESTARTING: 1,
    // github.com/Stability-AI/stablediffusion was taken down (404), so Forge's
    // hardcoded default in modules/launch_utils.py can no longer be cloned.
    // Point it at a mirror that carries the same pinned commit
    // (cf1d67a6fd5ea1aa600c4df58e5b47da45f6bdbf). Forge checks that hash out, and
    // git verifies it, so the resulting tree is identical to the original.
    STABLE_DIFFUSION_REPO: "https://github.com/licyk/stablediffusion.git",
    // Without this, a missing/private repo makes Git Credential Manager open a
    // browser auth prompt that hangs the shell instead of failing fast.
    GIT_TERMINAL_PROMPT: 0
  }
  if (kernel.platform === 'darwin' && kernel.arch === 'x64') {
    env.PYTORCH_MPS_HIGH_WATERMARK_RATIO = 0
  }
  return {
    daemon: true,
    run: [{
      // A failed clone can leave an empty .git husk behind. Forge's git_clone()
      // then takes its "already exists" branch and aborts instead of re-cloning,
      // so the launcher can never self-heal. A valid clone always contains ldm/;
      // if that is missing, drop the husk so the mirror clone can run.
      when: "{{exists('app/repositories/stable-diffusion-stability-ai') && !exists('app/repositories/stable-diffusion-stability-ai/ldm')}}",
      method: "fs.rm",
      params: {
        path: "app/repositories/stable-diffusion-stability-ai"
      }
    }, {
      // opencv-python 5.x hard-requires numpy>=2, which overrides Forge's own
      // numpy==1.26.2 pin in requirements_versions.txt. torch 2.1.2 and
      // scikit-image 0.21.0 are compiled against the numpy 1.x ABI, so numpy 2
      // makes `from skimage import exposure` die with "numpy.dtype size changed".
      // Hold both back to the versions this Forge vintage was built against.
      // Cheap on every start: uv audits an already-satisfied set in well under a second.
      method: "shell.run",
      params: {
        venv: "venv",
        path: "app",
        message: [
          "uv pip install numpy==1.26.2 opencv-python==4.8.0.76 opencv-contrib-python==4.8.0.76 opencv-python-headless==4.8.0.76"
        ]
      }
    }, {
      // Reserve the port up front so the URL is known before Forge starts.
      method: "local.set",
      params: {
        port: "{{port}}"
      }
    }, {
      // DEVIATION FROM THE CRITICAL PATTERN LOCK — approved by the user.
      //
      // The documented pattern derives `url` by regex-matching the server's output.
      // That does not work for Forge on kernel 8.0.40: neither the canonical
      // "/http:\/\/[0-9.:]+/" nor the capture-group "/(http:\\/\\/[0-9.:]+)/" ever
      // matches its "Running on local URL:" line, so the script parked on the
      // shell.run step forever at state=starting / ready_url=null and the Open Web UI
      // tab never appeared. Isolation tests confirmed the `on` mechanism, both regex
      // forms, `env` and `path` all work correctly here, so the cause is specific to
      // Forge's output stream — most likely the URL being split across read chunks,
      // since Forge emits ~4.4KB before printing it.
      //
      // Setting `url` from the port we already reserved removes the dependency on
      // matching output at all, and must happen BEFORE the launch step: that step is
      // the daemon and never returns, so anything after it is not guaranteed to run.
      method: "local.set",
      params: {
        "url": "http://127.0.0.1:{{local.port}}"
      }
    }, {
      method: "shell.run",
      params: {
        path: "app",
        message: (kernel.platform === 'win32' ? 'webui-user.bat' : 'bash webui.sh -f'),
        // GRADIO_SERVER_PORT is how the reserved port reaches Forge. Passing --port
        // on the command line would not work: webui-user.bat hardcodes
        // `set COMMANDLINE_ARGS=--no-download-sd-model`, clobbering anything inherited,
        // and webui.bat forwards only its own argv. Gradio reads this env var directly
        // (gradio/networking.py:26) because Forge leaves --port at its None default
        // (cmd_args.py:78 -> webui.py:87), so this sets the port without touching app/.
        env: Object.assign({}, env, { GRADIO_SERVER_PORT: "{{local.port}}" }),
        // Kept as a best-effort advance to proxy.start below. `url` no longer depends
        // on it, so a missed match now costs only Local Sharing, not the Web UI tab.
        on: [{ "event": "/(http:\\/\\/[0-9.:]+)/", "done": true }]
      }
    }, {
      "method": "proxy.start",
      "params": {
        "uri": "{{local.url}}",
        "name": "Local Sharing"
      }
    }]
  }
}
