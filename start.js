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
      method: "shell.run",
      params: {
        path: "app",
        message: (kernel.platform === 'win32' ? 'webui-user.bat' : 'bash webui.sh -f'),
        env,
        // Capture-group form per the Critical Pattern Lock. The bare-slash variant
        // ("/http:\/\/[0-9.:]+/") never matched Forge's "Running on local URL:" line
        // on kernel 8.0.40 — the script parked at this step forever with
        // state=starting / ready_url=null, so the Open Web UI tab never appeared.
        on: [{ "event": "/(http:\\/\\/[0-9.:]+)/", "done": true }]
      }
    }, {
      method: "local.set",
      params: {
        // index 1 = the parenthesized capture from the regex above
        "url": "{{input.event[1]}}",
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
