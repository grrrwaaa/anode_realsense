const realsense = require('bindings')('realsense.node');
const { vec2, vec3, vec4, quat, mat2, mat2d, mat3, mat4} = require("gl-matrix")

Object.defineProperty(realsense.Camera.prototype, "calibrate", {
	// blend must be > 0 and <= 1
	value: function(pos=[0,0,0], rotation=0, blend=0.1, upsidedown=false) {
		if (!this.axisy) this.axisy = [0, 1, 0]
		let { modelmatrix, accel, axisy } = this;

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
		mat4.scale(modelmatrix, modelmatrix, [-1, 1, 1]) // mirror
		mat4.translate(modelmatrix, modelmatrix, pos)
		//mat4.scale(modelmatrix, modelmatrix, [1, -1, -1]) // flip coordinate for Opengl
		mat4.rotateY(modelmatrix, modelmatrix, rotation)
		mat4.multiply(modelmatrix, modelmatrix, z_mat)
		mat4.multiply(modelmatrix, modelmatrix, x_mat)
	
		
		// // get up-vector by lerping to inverted gravity:
		// let a = vec3.clone(accel)
		// vec3.normalize(a, a)
		// vec3.scale(a, a, upsidedown ? 1 : -1)
		// vec3.lerp(axisy, axisy, a, blend)
		// vec3.normalize(axisy, axisy)

		// //if (0) {
		// 	// method 1:

		// 	// get local coordinate frame rotation from up-velctor
		// 	let xrot = Math.atan2(axisy[2], axisy[1])
		// 	let zrot = Math.atan2(axisy[0], axisy[1]) 

		// 	let z_mat = mat4.fromZRotation(mat4.create(), -zrot)
		// 	let x_mat = mat4.fromXRotation(mat4.create(), -xrot)

		// 	mat4.identity(modelmatrix)
		// 	mat4.translate(modelmatrix, modelmatrix, pos)
		// 	mat4.rotateY(modelmatrix, modelmatrix, rot)
		// 	mat4.multiply(modelmatrix, modelmatrix, x_mat)
		// 	mat4.multiply(modelmatrix, modelmatrix, z_mat)
		// } else {
		// 	// method 2:
		// 	let axisx, axisz, other_axis
		// 	other_axis = [0, 1, 0]

		// 	if (1) {
		// 		axisz = vec3.cross(vec3.create(), axisy, other_axis)
		// 		vec3.normalize(axisz, axisz)
		// 		axisx = vec3.cross(vec3.create(), axisz, axisy)
		// 		vec3.normalize(axisx, axisx)
		// 	} else {
		// 		axisx = vec3.cross(vec3.create(), axisy, other_axis)
		// 		vec3.normalize(axisx, axisx)
		// 		axisz = vec3.cross(vec3.create(), axisy, axisx)
		// 		vec3.normalize(axisz, axisz)
		// 	}

		// 	let cammatrix = mat4.create()
		// 	if (1) {
		// 		mat4.set(cammatrix, 
		// 			axisx[0], axisx[1], axisx[2], 0.,
		// 			axisy[0], axisy[1], axisy[2], 0.,
		// 			axisz[0], axisz[1], axisz[2], 0.,
		// 			0, 0, 0, 1);
		// 	} else {
		// 		mat4.set(cammatrix, 
		// 			axisx[0], axisy[0], axisz[0], 0.,
		// 			axisx[1], axisy[1], axisz[1], 0.,
		// 			axisx[2], axisy[2], axisz[2], 0.,
		// 			0, 0, 0, 1);
		// 	}

		// 	mat4.identity(modelmatrix)
		// 	// mat4.translate(modelmatrix, modelmatrix, pos)
		// 	// mat4.rotateY(modelmatrix, modelmatrix, rot)
		// 	if (1) {
		// 		mat4.multiply(modelmatrix, modelmatrix, cammatrix)
		// 	} else {
		// 		mat4.multiply(modelmatrix, cammatrix, modelmatrix)
		// 	}
		// }
		
	},
});

module.exports = realsense