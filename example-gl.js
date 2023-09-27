
const assert = require("assert"),
	fs = require("fs"),
    path = require("path")

// add anode_gl to the module search paths:
module.paths.push(path.resolve(path.join(__dirname, "..", "anode_gl")))

const gl = require('gles3.js'),
	glfw = require('glfw3.js'),
    Window = require("window.js"),
	glutils = require('glutils.js'),
	Config = require('config.js')

const { vec2, vec3, vec4, quat, mat2, mat2d, mat3, mat4} = require("gl-matrix")

const realsense = require("./realsense.js")

let calibration = Config("calibration.json")
console.log(calibration)


console.log(realsense.devices)

// the view will be oriented to the screen
// near & far set the effective minimum and maximum distance from the screen (in meters) that data is rendered:
let near = 0.1, far = 10 
// the camera position relative to the screen
// (x position along screen width, y up from screen base, z meters in front of the screen)
let camera_pos = [0, 1, 0]
let camera_rotation = 0

let window = new Window({})

let cloudprogram = glutils.makeProgram(gl, `#version 330
uniform mat4 u_viewmatrix;
uniform mat4 u_projmatrix;
uniform float u_pixelsize;
uniform vec4 u_color;
layout(location = 0) in vec4 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texCoord;
//layout(location = 3) in vec4 a_color;
out vec4 v_color;

void main() {
	// Multiply the position by the matrix.
	vec4 worldpos = vec4(a_position.xyz, 1);
	vec4 viewpos = u_viewmatrix * worldpos;
	gl_Position = u_projmatrix * viewpos;
	if (gl_Position.w > 0.0) {
		gl_PointSize = u_pixelsize / gl_Position.w;
	} else {
		gl_PointSize = 0.0;
	}

	v_color = vec4(1.);
	//v_color = vec4(a_texCoord, 0.5, 1.);
	//v_color = vec4(a_normal*0.5+0.5, 1.);
	v_color = worldpos * 0.5 + 0.5;
	//v_color = mix(v_color, vec4(1.), 0.5);
}
`, 
`#version 330
precision mediump float;

in vec4 v_color;
layout(location = 0) out vec4 outColor;

void main() {
	// get normalized -1..1 point coordinate
	vec2 pc = (gl_PointCoord - 0.5) * 2.0;
	// convert to distance:
	float dist = max(0., 1.0 - length(pc));
	// paint
  	outColor = v_color * dist;
	//outColor = vec4(1.);
}
`);


let serial = "f1230113" //"f1181489" //"f1230113"
let cam = new realsense.Camera(serial)
cam.modelmatrix = mat4.create();
cam.maxarea = 0.0001
cam.min = [-10, -10, -10]
cam.max = [10, 10, 10]
cam.grab(true) // true means wait for a result


let axisy = [0, 1, 0] // some basic default
let modelmatrix_cam = cam.modelmatrix //mat4.create();

const NUM_POINTS = 640 * 480 // = 307200
let points_geom = {
	vertices: cam.vertices,
	normals: cam.normals,
	texCoords: new Float32Array(NUM_POINTS*2)
}
let points = glutils.createVao(gl, points_geom)
for (let i=0; i<NUM_POINTS; i++) {
	let col = i % 640, row = Math.floor(i/640)
	let u = (col+0.5) / 640
	let v = (row+0.5) / 480
	points.geom.texCoords[i*2+0] = u
	points.geom.texCoords[i*2+1] = v
}

window.draw = function() {
	let { t, dt, dim } = this;

	let viewmatrix = mat4.create()
	let projmatrix = mat4.create()

	//camera_rotation = t

	if (cam.grab(false, 0.0001)) {
		if (true || t < 10) {
			let calib = calibration[serial]
			cam.calibrate(calib.pos, calib.rotation, 0.1, calib.upsidedown)

			let { modelmatrix, accel } = cam;
			let { pos, rotation, upsidedown } = calib
			let sign = upsidedown ? -1 : 1;

			//console.log(accel, pos, rotation, upsidedown)
		
			// get up-vector by lerping to inverted gravity:
			let a = vec3.clone(accel)
			vec3.normalize(a, a)
			vec3.scale(a, a, -1)
            vec3.lerp(axisy, axisy, a, 0.1)
            vec3.normalize(axisy, axisy)
			let axisx, axisz, other_axis

			// get local coordinate frame rotation from up-velctor
			let xrot = Math.atan2(axisy[2], axisy[1])
			let zrot = Math.atan2(axisy[0], axisy[1]) 

			let x_mat = mat4.fromXRotation(mat4.create(), -xrot)
			let z_mat = mat4.fromZRotation(mat4.create(), -zrot)

			mat4.identity(modelmatrix)
			mat4.translate(modelmatrix, modelmatrix, pos)
			//mat4.scale(modelmatrix, modelmatrix, [1, -1, -1]) // flip coordinate for Opengl
			mat4.rotateY(modelmatrix, modelmatrix, rotation)
			mat4.multiply(modelmatrix, modelmatrix, z_mat)
			mat4.multiply(modelmatrix, modelmatrix, x_mat)
		
		}

		points.bind().submit()

		//console.log(cam.count, points.geom.vertices.slice(0, 3))
	}

	gl.viewport(0, 0, dim[0], dim[1]);
	gl.enable(gl.DEPTH_TEST)
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	mat4.identity(viewmatrix)
	let aspect = dim[0]/dim[1]
	let screen_height = 3.42
	let a = t * 0
	let h = 0 //screen_height / 2
	let c = far / 2
	let r = c
	let at = [0, 0, -c]
	let eye = [at[0] + r*Math.sin(a), at[1], at[2] + r*Math.cos(a)]
	mat4.lookAt(viewmatrix, eye, at, [0, 1, 0])
	//mat4.lookAt(viewmatrix, [r*Math.sin(a), 0, r*Math.cos(a)], [0, 0, 0], [0, 1, 0])
	mat4.perspective(projmatrix, Math.PI * 0.5, dim[0]/dim[1], near, far)
	//mat4.ortho(projmatrix, -screen_height*aspect/2, screen_height*aspect/2, 0, screen_height, near, far)

	gl.disable(gl.DEPTH_TEST)
	gl.depthMask(false);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

	cloudprogram.begin()
	.uniform ( "u_viewmatrix", viewmatrix)
	.uniform ( "u_projmatrix", projmatrix)
	.uniform ( "u_pixelsize", dim[1] / 100)
	points.bind().drawPoints().unbind()
	
	//show_shader.begin()
	//quad_vao.bind().draw()

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST)
	gl.depthMask(true);
}

Window.animate()