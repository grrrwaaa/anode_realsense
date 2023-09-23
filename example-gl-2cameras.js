
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
	//v_color = vec4(a_normal*0.5+0.5, 1.);
	v_color = u_color;
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

	cam.pos = [-(0.5-i)*1.45, 1.8, 0]
	cam.rotation = (0.5-i)*-Math.PI * 0.6

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
				cam.calibrate(cam.pos, cam.rotation)
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
	let z = -1
	let r = 2
	let h = 1 // height of rendering camera above ground
	let at = [0, h, z]
	let eye = [Math.sin(a), 0, Math.cos(a)]
	vec3.scale(eye, eye, r)
	vec3.add(eye, eye, at)
	mat4.lookAt(viewmatrix, eye, at, [0, 1, 0])
	mat4.perspective(projmatrix, Math.PI * 0.3, dim[0]/dim[1], near, far)

	gl.disable(gl.DEPTH_TEST)
	gl.depthMask(false);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

	let shader = cloudprogram.begin()
	.uniform ( "u_viewmatrix", viewmatrix)
	.uniform ( "u_projmatrix", projmatrix)
	.uniform ( "u_pixelsize", dim[1] / 500)
	cameras.forEach((cam, i) => {
		shader.uniform( "u_color", [i, 1-i, 1, 1])
		cam.points_vao.bind().drawPoints().unbind()
	})
	//show_shader.begin()
	//quad_vao.bind().draw()

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST)
	gl.depthMask(true);
}

Window.animate()