
const assert = require("assert"),
	fs = require("fs"),
    path = require("path")

// add anode_gl to the module search paths:
module.paths.push(path.resolve(path.join(__dirname, "..", "anode_gl")))

const gl = require('gles3.js'),
	glfw = require('glfw3.js'),
    Window = require("window.js"),
	glutils = require('glutils.js')

const { vec2, vec3, vec4, quat, mat2, mat2d, mat3, mat4} = require("gl-matrix")

const realsense = require("./realsense.js")
console.log(realsense.devices)

// the view will be oriented to the screen
// near & far set the effective minimum and maximum distance from the screen (in meters) that data is rendered:
let near = 0.1, far = 10 

let window = new Window()


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
	vec4 viewpos = u_viewmatrix * vec4(a_position.xyz, 1);
	gl_Position = u_projmatrix * viewpos;
	if (gl_Position.w > 0.0) {
		gl_PointSize = u_pixelsize / gl_Position.w;
	} else {
		gl_PointSize = 0.0;
	}

	v_color = vec4(1.);
	//v_color = vec4(a_texCoord, 0.5, 1.);
	v_color = vec4(a_normal*0.5+0.5, 1.);
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
}
`);


let cameras = realsense.devices.map((dev, i) => {
	let cam = new realsense.Camera({
		serial: dev.serial,
		width: 1024, //640,
		fps: 30
	})

	cam.pos = [-(0.5-i), 1.25, 0]
	cam.rotation = (0.5-i)*Math.PI/2

	cam.modelmatrix = mat4.create();
	cam.maxarea = 0.0001
	cam.min = [-10, -10, -10]
	cam.max = [10, 10, 10]
	cam.grab(true) // true means wait for a result

	//console.log(cam)

	const NUM_POINTS = cam.width * cam.height // = 307200

	let points_geom = {
		vertices: cam.vertices,
		normals: cam.normals,
		texCoords: new Float32Array(NUM_POINTS*2)
	}
	for (let i=0; i<NUM_POINTS; i++) {
		let col = i % cam.width, row = Math.floor(i/cam.width)
		let u = (col+0.5) / cam.width
		let v = (row+0.5) / cam.height
		points_geom.texCoords[i*2+0] = u
		points_geom.texCoords[i*2+1] = v
	}
	cam.points_vao = glutils.createVao(gl, points_geom)

	cam.axisy = [0, 1, 0] // some basic default

	return cam
})


window.draw = function() {
	let { t, dt, dim } = this;

	let viewmatrix = mat4.create()
	let projmatrix = mat4.create()

	cameras.forEach(cam => {
		if (cam.grab(false, 0.0001)) {
			if (true || t < 10) {
				let { axisy, modelmatrix } = cam;
				// in the first 10 seconds, use accelerometer data to adjust our orientation
				let a = vec3.clone(cam.accel)
				vec3.normalize(a, a)
				vec3.lerp(axisy, axisy, a, 0.1)
				vec3.normalize(axisy, axisy)

				// the up (Y) axis of our camera view is opposite to gravity, i.e. -cam.accel

				// we assume that the camera's X axis is

				// OK so that tells us what our axis z is supposed to be. 
	
				let axisz = vec3.cross(vec3.create(), axisy, [axisy[2], axisy[0], axisy[1]])
				vec3.normalize(axisz, axisz)
				let axisx = vec3.cross(vec3.create(), axisy, axisz)
				vec3.normalize(axisz, axisz)
	
				let cammatrix = mat4.create()
				mat4.set(cammatrix, 
					axisx[0], axisy[0], axisz[0], 0.,
					axisx[1], axisy[1], axisz[1], 0.,
					axisx[2], axisy[2], axisz[2], 0.,
					0, 0, 0, 1);
	
				// this process has probably left our axisx and axisz not properly rotated to the XZ plane anymore
				// I'd like to rotateY to ensure that axisx is maximal in +x
				// get the rotation around Y that would make axisx.x maximal:
				let m = mat4.create()
				mat4.fromRotation(m, -Math.acos(cammatrix[0]), [0, 1, 0])
				mat4.multiply(cammatrix, m, cammatrix)
	
				// now generate our camera's modelmatrix
				mat4.identity(modelmatrix)
				mat4.translate(modelmatrix, modelmatrix, cam.pos)
				mat4.rotateY(modelmatrix, modelmatrix, cam.rotation)
				mat4.multiply(modelmatrix, modelmatrix, cammatrix)
	
				//console.log(cam.modelmatrix)
			}
	
			cam.points_vao.bind().submit()
	
			//console.log(cam.count, points.geom.vertices.slice(0, 3))
		}
	})


	gl.viewport(0, 0, dim[0], dim[1]);
	gl.enable(gl.DEPTH_TEST)
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	mat4.identity(viewmatrix)
	let a = t
	let r = 1
	mat4.lookAt(viewmatrix, [r*Math.sin(a), 0, r*Math.cos(a)], [0, 0, 0], [0, 1, 0])
	mat4.perspective(projmatrix, Math.PI * 0.7, dim[0]/dim[1], near, far)

	gl.disable(gl.DEPTH_TEST)
	gl.depthMask(false);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

	cloudprogram.begin()
	.uniform ( "u_viewmatrix", viewmatrix)
	.uniform ( "u_projmatrix", projmatrix)
	.uniform ( "u_pixelsize", dim[1] / 500)
	cameras.forEach(cam => {
		cam.points_vao.bind().drawPoints().unbind()
	})
	//show_shader.begin()
	//quad_vao.bind().draw()

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST)
	gl.depthMask(true);
}

Window.animate()