module.exports = async (kernel) => {
  let script = {
    run: [{
      method: "shell.run",
      params: {
        message: [
          //"git clone -b dev2 https://github.com/betapeanut/stable-diffusion-webui-forge app",
          "git clone https://github.com/betapeanut/stable-diffusion-webui-forge app",
        ]
      }
    }, {
      method: "fs.link",
      params: {
        drive: {
          checkpoints: "app/models/Stable-diffusion",
          vae: "app/models/VAE",
          loras: [
            "app/models/Lora",
            "app/models/LyCORIS"
          ],
          upscale_models: [
            "app/models/ESRGAN",
            "app/models/RealESRGAN",
            "app/models/SwinIR"
          ],
          embeddings: "app/embeddings",
          hypernetworks: "app/models/hypernetworks",
          controlnet: "app/models/ControlNet"
        },
        peers: [
          "https://github.com/pinokiofactory/comfy.git",
          "https://github.com/cocktailpeanutlabs/comfyui.git",
          "https://github.com/cocktailpeanutlabs/fooocus.git",
          "https://github.com/cocktailpeanutlabs/automatic1111.git",
        ]
      }
    }, {
      method: "fs.link",
      params: {
        drive: {
          outputs: "app/output"
        }
      }
//    }, {
//      when: "{{platform === 'darwin' && arch !== 'arm64'}}",  // intel mac
//      method: "self.set",
//      params: {
//        "app/ui-config.json": {
//          "txt2img/Sampling steps/value": 1,
//          "txt2img/CFG Scale/value": 1.0
//        }
//      }
//    }, {
//      when: "{{platform === 'darwin' && arch !== 'arm64'}}",  // intel mac
//      method: "fs.download",
//      params: {
//        uri: "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors?download=true",
//        dir: "app/models/Stable-diffusion"
//      }
    }, {
      method: "fs.download",
      params: {
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
        dir: "app/models/Stable-diffusion"
      }
    }, {
      method: "fs.download",
      params: {
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
        dir: "app/models/Stable-diffusion"
      }
    }, {
      uri: "setup.js",
      method: "write"
    }, {
      // A previously failed clone can leave an empty .git husk behind. Forge's
      // git_clone() then takes its "already exists" branch and aborts instead of
      // re-cloning. A valid clone always contains ldm/; if that is missing, drop
      // the husk so the mirror clone below can run.
      when: "{{exists('app/repositories/stable-diffusion-stability-ai') && !exists('app/repositories/stable-diffusion-stability-ai/ldm')}}",
      method: "fs.rm",
      params: {
        path: "app/repositories/stable-diffusion-stability-ai"
      }
    }, {
      method: "shell.run",
      params: {
        message: "{{platform === 'win32' ? 'webui-user.bat' : 'bash webui.sh -f'}}",
        env: {
          SD_WEBUI_RESTARTING: 1,
          // github.com/Stability-AI/stablediffusion was taken down (404), so Forge's
          // hardcoded default in modules/launch_utils.py can no longer be cloned.
          // Point it at a mirror that carries the same pinned commit
          // (cf1d67a6fd5ea1aa600c4df58e5b47da45f6bdbf). Forge checks that hash out, and
          // git verifies it, so the resulting tree is identical to the original.
          STABLE_DIFFUSION_REPO: "https://github.com/licyk/stablediffusion.git",
          // Without this, a missing/private repo makes Git Credential Manager open a
          // browser auth prompt that hangs the shell instead of failing fast.
          GIT_TERMINAL_PROMPT: 0,
        },
        path: "app",
        // Same capture-group form as start.js. With the bare-slash variant this step
        // would never match on a successful launch, hanging the install indefinitely.
        on: [{ "event": "/(http:\\/\\/[0-9.:]+)/", "kill": true }]
      }
    }, {
      // Runs after the step above, because that is what installs Forge's base and
      // extension requirements — and what drags in opencv-python 5.x, whose
      // numpy>=2 requirement overrides Forge's own numpy==1.26.2 pin. torch 2.1.2
      // and scikit-image 0.21.0 are built against the numpy 1.x ABI, so numpy 2
      // breaks `from skimage import exposure`. Repair the pins once deps are in place.
      method: "shell.run",
      params: {
        venv: "venv",
        path: "app",
        message: [
          "uv pip install numpy==1.26.2 opencv-python==4.8.0.76 opencv-contrib-python==4.8.0.76 opencv-python-headless==4.8.0.76"
        ]
      }
    }, {
      method: "notify",
      params: {
        html: "Click the 'start' tab to launch the app"
      }
    }]
  }
  if (kernel.platform === 'darwin') {
    script.requires = [{
      platform: "darwin",
      type: "conda",
      name: ["cmake", "protobuf", "rust", "wget"],
      args: "-c conda-forge"
    }]
  }
  return script
}
