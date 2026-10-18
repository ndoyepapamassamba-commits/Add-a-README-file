import gpu, bpy
print('GPUINFO', gpu.platform.backend_type_get(), '|', gpu.platform.vendor_get(), '|', gpu.platform.renderer_get(), '|', gpu.platform.version_get(), '|', gpu.platform.device_type_get())
print('MAXTEX', gpu.capabilities.max_texture_size_get())
