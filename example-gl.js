
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
// the camera position relative to the screen
// (x position along screen width, y up from screen base, z meters in front of the screen)
let camera_pos = [0, 1, 0]
let camera_rotation = 0

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



let cam = new realsense.Camera().start()
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
            // in the first 10 seconds, use accelerometer data to adjust our orientation
			let a = vec3.clone(cam.accel)
			vec3.normalize(a, a)
			vec3.scale(a, a, -1)
            vec3.lerp(axisy, axisy, a, 0.25)
            vec3.normalize(axisy, axisy)
			let axisx, axisz, other_axis

			//console.log("up", axisy.join(",, "))
			//console.log(Math.abs(axisy[0]), Math.abs(axisy[1]), Math.abs(axisy[2]))

			// ok so now we know which axis points up. It could be anything, including 0,0,1,  1,0,0,  0,1,0, etc. 
			// we want to rotate the cloud so that axisy becomes 0,1,0
			// the usual method is to use cross products with some other axis orthogonal to axisy in order to build up a coordinate frame
			// there's an infinite set of solutions, because there's an infinite set of possible orthogonal axes
			// (because we can still rotate around axisy to get any axisx/z direction)
			// what axis we use will determine that rotation

			// observation: if we rotate mostly around the forward (-z) axis of the camera, then the Z component of the accelerometer doesn't really change. 
			// that should mean that we can use the angle of axisy.xy to derive our rotation about the camera's view axis
			let zrot = Math.atan2(axisy[0], axisy[1])  // this is zero when the camera mount is most downward, i.e. no z rotation
			//console.log(180/Math.PI * zrot)

			// if we invert this rotation on the point cloud, it should always put the floor at the bottom
			// (yes it does, though there's gimbal issue of course when camera faces up/down)
			let z_mat = mat4.fromZRotation(mat4.create(), -zrot)

			// next observation: rotation around the camera's own +x axis makes no change to up.x
			// so camera-relative rotation is atan2() of up.yz
			let xrot = Math.atan2(axisy[2], axisy[1])  // this is zero when the camera mount is most downward, i.e. no z rotation
			console.log(180/Math.PI * xrot)
			// but that's not helpful -- what we care about is x rotation relative to ground, not relative to the camera
			let x_mat = mat4.fromXRotation(mat4.create(), -xrot)



			// we'd like to pick that axis such that a typical raw camera point of 0,0,-1 would still end up in the same ballpark of -z after rotation (and certainly not end up in +z)


			// however that won't work if the camera is mostly looking straight up or down; 
			// (i.e. axisy's Z component has the greatest magnitude)
			let mostly_up_or_down = Math.abs(axisy[2]) > Math.abs(axisy[0]) && Math.abs(axisy[2]) > Math.abs(axisy[1])
			let mostly_up = mostly_up_or_down && (axisy[2] < 0)
			// in that case we can only optimize for a point at -1,0,0 ending up in -x)

			// one way is to just swizzle the axisy components to get some arbitrary orthogonal axis, 
			// but that will leave us with a rotation that is randomly dependent on axisy
			// another way is to pick whichever normal axis (X, Y or Z) that is least similar to the axisy
			// (the smallest absolute dot product)
			// use 1,0,0 if abs(axisy[0]) is smallest, etc. 

			// are we looking mostly up/down?
			// true if Y component of axisy is greatest
			
			if (Math.abs(axisy[2]) > Math.abs(axisy[0]) && Math.abs(axisy[2]) > Math.abs(axisy[1])) { 
				// Z component is greatest, axisy must be most similar to 0,0,1 or 0,0,-1
				// (i.e. camera is horizontally mounted, facing mostly vertically up or down)

				// let's use an orthogonal reference axis of 1,0,0
				// no matter what orientation, this will *always* result in axisz.x == 0
				other_axis = [1, 0, 0]
				
			} else if (Math.abs(axisy[1]) > Math.abs(axisy[0]) && Math.abs(axisy[1]) > Math.abs(axisy[2])) { 
				// Y component is greatest, axisy must be most similar to 0,1,0 or 0,-1,0
				// (i.e. camera is close to a "normal" orientation facing in a horizontal plane)

				// let's use an orthogonal reference axis of 1,0,0
				// no matter what orientation, this will *always* result in axisz.x == 0
				other_axis = [1, 0, 0]
				
			} else {
				// X component is greatest, axisy must be most similar to 1,0,0 or -1,0,0
				// (i.e. camera is vertically positioned and looking in a horizontal plane, but twisted sideways around its point of view)

				other_axis = [0, 0, 1]
			}

			// other_axis = [axisy[1], axisy[2], axisy[0]]
			// other_axis = [axisy[2], axisy[0], axisy[1]]

			// there's also two ways to generate the frame: z first, or x first
			
			if ((t % 1) < 0.3) {
				axisz = vec3.cross(vec3.create(), axisy, other_axis)
				vec3.normalize(axisz, axisz)
				axisx = vec3.cross(vec3.create(), axisz, axisy)
				vec3.normalize(axisx, axisx)
			} else {
				axisx = vec3.cross(vec3.create(), axisy, other_axis)
				vec3.normalize(axisx, axisx)
				axisz = vec3.cross(vec3.create(), axisx, axisy)
				vec3.normalize(axisz, axisz)
			}

            let cammatrix = mat4.set(mat4.create(), 
				axisx[0], axisx[1], axisx[2], 0.,
				axisy[0], axisy[1], axisy[2], 0.,
				axisz[0], axisz[1], axisz[2], 0.,
				0, 0, 0, 1);
			// let cammatrix = mat4.set(mat4.create(), 
			// 	axisx[0], axisy[0], axisz[0], 0.,
			// 	axisx[1], axisy[1], axisz[1], 0.,
			// 	axisx[2], axisy[2], axisz[2], 0.,
			// 	0, 0, 0, 1);

			// console.log("y", axisy.join(",, "))
			// console.log("x", axisx.join(",, "))
			// console.log("z", axisz.join(",, "))

            // now generate our camera's modelmatrix
            mat4.identity(modelmatrix_cam)
            // mat4.translate(modelmatrix_cam, modelmatrix_cam, camera_pos)
            // mat4.rotateY(modelmatrix_cam, modelmatrix_cam, camera_rotation)
            //mat4.multiply(modelmatrix_cam, modelmatrix_cam, cammatrix)
            //mat4.multiply(modelmatrix_cam, cammatrix, modelmatrix_cam)

			//mat4.rotateZ(modelmatrix_cam, -zrot)
			mat4.multiply(modelmatrix_cam, modelmatrix_cam, x_mat)
		}

		points.bind().submit()

		//console.log(cam.count, points.geom.vertices.slice(0, 3))
	}

	gl.viewport(0, 0, dim[0], dim[1]);
	gl.enable(gl.DEPTH_TEST)
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	mat4.identity(viewmatrix)
	let a = t
	let r = 1
	mat4.lookAt(viewmatrix, [0, 0, 0.1], [0, 0, 0], [0, 1, 0])
	//mat4.lookAt(viewmatrix, [r*Math.sin(a), 0, r*Math.cos(a)], [0, 0, 0], [0, 1, 0])
	mat4.perspective(projmatrix, Math.PI * 0.5, dim[0]/dim[1], near, far)

	gl.disable(gl.DEPTH_TEST)
	gl.depthMask(false);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

	cloudprogram.begin()
	.uniform ( "u_viewmatrix", viewmatrix)
	.uniform ( "u_projmatrix", projmatrix)
	.uniform ( "u_pixelsize", dim[1] / 500)
	points.bind().drawPoints().unbind()
	
	//show_shader.begin()
	//quad_vao.bind().draw()

	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST)
	gl.depthMask(true);
}

Window.animate()