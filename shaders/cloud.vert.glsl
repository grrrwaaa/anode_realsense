#version 330
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
	v_color = u_color;
	//v_color.rgb = smoothstep(0.25, 0.76, mod(worldpos.z * vec3(1., 4., 16.), 1.));
}