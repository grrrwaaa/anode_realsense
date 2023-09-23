
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
let near = 0.1, far = 3 
// height of screen in meters
let ortho_height_m = 2

let window = new Window({
	width: 1920,
	height: 1080,
})

const shaderman = new Shaderman(gl)

const flat_fbo = glutils.makeGbuffer(gl, window.width, window.height, [{}]);

const quad_vao = glutils.createVao(gl, glutils.makeQuad())

let show_program = shaderman.shaders.show

let cloud_depth_program = shaderman.shaders.cloud_depth


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
				let calib = calibration[cam.serial]
				if (calib) Object.assign(cam, calib)
				cam.calibrate(cam.pos, cam.rotation)
			}
	
			cam.points_vao.bind().submit()
	
			//console.log(cam.count, points.geom.vertices.slice(0, 3))
		}
	})

	flat_fbo.begin() 
    {
        let dim = [flat_fbo.width, flat_fbo.height]
        let aspect = dim[0]/dim[1]
        mat4.ortho(projmatrix, 
            // x axis centered on screen:
            -aspect*ortho_height_m/2, aspect*ortho_height_m/2, 
            // y axis up from bottom of screen:
            0, ortho_height_m, 
            near, far)
        // view matrix looking out of screen
        mat4.identity(viewmatrix)

        gl.viewport(0, 0, dim[0], dim[1]);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let shader = shaderman.shaders.cloud_depth.begin()
        .uniform("u_viewmatrix", viewmatrix)
        .uniform("u_projmatrix", projmatrix)
        .uniform("u_near", near)
        .uniform("u_far", far)
        .uniform("u_pointsize", dim[0] * 0.005)

		cameras.forEach((cam, i) => {
			shader.uniform( "u_color", [i, 1-i, 1, 1])
			cam.points_vao.bind().drawPoints().unbind()
		})
    }
    flat_fbo.end()


	gl.viewport(0, 0, dim[0], dim[1]);
	gl.enable(gl.DEPTH_TEST)
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


	gl.disable(gl.DEPTH_TEST)
	gl.depthMask(false);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

	flat_fbo.bind()
	shaderman.shaders.show.begin()
	quad_vao.bind().draw()

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST)
	gl.depthMask(true);
}

Window.animate()