"""Render a .blend/.glb without changing it: blender -b --python this.py -- input output.png."""
import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=768)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = arguments()
    source = args.input.resolve(strict=True)
    output = args.output.resolve()
    if source.suffix.lower() not in (".blend", ".glb"):
        raise ValueError("Input must be a .blend or .glb file")
    if output.suffix.lower() != ".png" or not 64 <= args.size <= 2048:
        raise ValueError("Output must be PNG; size must be between 64 and 2048")
    if source == output:
        raise ValueError("Output must differ from input")
    if source.suffix.lower() == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(source))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = [obj.matrix_world @ Vector(corner)
              for obj in scene.objects if obj.type == "MESH" and not obj.hide_render
              for corner in obj.evaluated_get(depsgraph).bound_box]
    if not points:
        raise ValueError("No renderable mesh found")
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) / 2
    radius = max((high - low).length / 2, 0.01)
    if scene.camera is None:
        scene.camera = next((obj for obj in scene.objects if obj.type == "CAMERA"), None)
    if scene.camera is None:
        camera = bpy.data.cameras.new("PreviewCamera")
        scene.camera = bpy.data.objects.new("PreviewCamera", camera)
        scene.collection.objects.link(scene.camera)
        scene.camera.location = center + Vector((1.3, -1.7, 1.1)).normalized() * radius * 3.6
        camera.lens = 45
        camera.clip_start = max(radius / 100, 0.001)
        camera.clip_end = radius * 100
        aim(scene.camera, center)
    if not any(obj.type == "LIGHT" and not obj.hide_render for obj in scene.objects):
        for name, offset, strength, color in [
            ("PreviewKey", (1, -2, 3), 450, (1.0, 0.88, 0.76)),
            ("PreviewFill", (-2, -1, 1), 220, (0.72, 0.85, 1.0)),
            ("PreviewRim", (1, 2, 2), 350, (1.0, 1.0, 1.0)),
        ]:
            light = bpy.data.lights.new(name, "AREA")
            light.energy = strength * radius * radius
            light.color = color
            light.shape = "DISK"
            light.size = radius * 2
            obj = bpy.data.objects.new(name, light)
            scene.collection.objects.link(obj)
            obj.location = center + Vector(offset) * radius
            aim(obj, center)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs[0].default_value = (0.09, 0.085, 0.075, 1)
        background.inputs[1].default_value = 0.5
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    else:
        raise RuntimeError("Eevee is not available in this Blender")
    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.use_file_extension = True
    scene.render.engine = engine
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 32
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"PREVIEW_SAVED={output}")


if __name__ == "__main__":
    main()
