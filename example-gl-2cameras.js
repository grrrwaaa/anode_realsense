
const assert = require("assert"),
	fs = require("fs"),
    path = require("path")

// add anode_gl to the module search paths:
module.paths.push(path.resolve(path.join(__dirname, "..", "anode_gl")))

const gl = require('gles3.js'),
	glfw = require('glfw3.js'),
    Window = require("window.js"),
	glutils = require('glutils.js'),
	Shaderman = require('shaderman.js'),
	Config = require('config.js')

const { vec2, vec3, vec4, quat, mat2, mat2d, mat3, mat4} = require("gl-matrix")

const realsense = require("./realsense.js")
console.log(realsense.devices)


let calibration = Config("calibration.json")
console.log(calibration)

// the view will be oriented to the screen
// near & far set the effective minimum and maximum distance from the screen (in meters) that data is rendered:
let near = 0.1, far = 10 

let window = new Window({
	width: 1920,
	height: 1080,
})

const shaderman = new Shaderman(gl)

const flat_fbo = glutils.makeGbuffer(gl, window.width, window.height, [{}]);

let cameras = realsense.devices.map((dev, i) => {
	let cam = new realsense.Camera({
		serial: dev.serial,
		width: 1024, //640,
		fps: 30
	})

	cam.modelmatrix = mat4.create();
	cam.maxarea = 0.0001
	cam.min = [-10, -10, -10]
	cam.max = [10, 10, 10]
	cam.grab(true) // true means wait for a result

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
				let calib = calibration[cam.serial]
				if (calib) Object.assign(cam, calib)
				cam.calibrate(cam.pos, cam.rotation)
			}
	
			cam.points_vao.bind().submit()
		}
	})


	gl.viewport(0, 0, dim[0], dim[1]);
	gl.enable(gl.DEPTH_TEST)
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	mat4.identity(viewmatrix)
	let a = t * 1
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

	let shader = shaderman.shaders.cloud.begin()
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