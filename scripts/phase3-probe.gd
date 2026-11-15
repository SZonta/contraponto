# Runtime assertions for the manual Contraponto tasks. No game files are written.
extends SceneTree

var preview: Node
var frames := 0

func require(condition: bool, message: String) -> bool:
	if not condition:
		push_error(message)
		quit(1)
		return false
	return true

func _initialize() -> void:
	var task := OS.get_cmdline_user_args()[0]
	if task == "a":
		var script = load("res://props/TapeState.cs")
		if not require(script != null and script.can_instantiate(), "TapeState script unavailable"):
			return
		var state = script.new()
		if not require(state is Resource, "TapeState must be a Resource"):
			return
		if not require(state.get("IsRewound") == false and state.get("HasBeenWatched") == false, "Incorrect initial tape state"):
			return
		if not require(state.has_method("Rewind") and state.has_method("MarkWatched"), "Missing tape methods"):
			return
		if not require(state.call("MarkWatched") == false and state.get("HasBeenWatched") == false, "Unrewound tape accepted"):
			return
		state.call("Rewind")
		if not require(state.get("IsRewound") == true, "Rewind failed"):
			return
		if not require(state.call("MarkWatched") == true and state.get("HasBeenWatched") == true, "Rewound tape was not watched"):
			return
		print("PHASE3_A_OK")
		quit(0)
	elif task == "b":
		var texture = load("res://assets/textures/tapes/tape_label_drama.png")
		if not require(texture is Texture2D and texture.get_width() == 512 and texture.get_height() == 256, "Drama label failed Godot import"):
			return
		print("PHASE3_B_OK")
		quit(0)
	elif task == "c":
		var packed = load("res://levels/tape_preview/tape_preview.tscn")
		if not require(packed is PackedScene, "Preview scene unavailable"):
			return
		preview = packed.instantiate()
		root.add_child.call_deferred(preview)
	else:
		require(false, "Unknown task")

func _process(_delta: float) -> bool:
	if preview == null:
		return false
	frames += 1
	if frames != 30:
		return false
	if not require(preview is Node3D and preview.get_script() != null and preview.get_script().resource_path == "res://props/TapePreview.cs", "Preview root must use TapePreview.cs"):
		return false
	var state = preview.get("State")
	if not require(state is Resource and state.get_script().resource_path == "res://props/TapeState.cs" and state.get("IsRewound") == true and state.get("HasBeenWatched") == true, "Preview must use rewound and watched TapeState"):
		return false
	var tape = preview.get_node_or_null("Tape")
	if not require(tape is RigidBody3D and tape.freeze and tape.scene_file_path == "res://props/tape.tscn", "Preview must instantiate and freeze existing tape"):
		return false
	for pair in [["DramaLabel", "tape_label_drama.png"], ["RewoundLabel", "tape_label_rewound.png"]]:
		var label = preview.get_node_or_null(pair[0])
		if not require(label is Sprite3D and label.visible and label.texture != null and label.texture.resource_path == "res://assets/textures/tapes/" + pair[1], "Incorrect preview texture: " + pair[0]):
			return false
	if not require(preview.get_viewport().get_camera_3d() != null, "Preview needs a current Camera3D"):
		return false
	print("PHASE3_C_OK")
	quit(0)
	return false
