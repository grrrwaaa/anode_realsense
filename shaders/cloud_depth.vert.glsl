#version 330
uniform mat4 u_projmatrix;
uniform mat4 u_viewmatrix;
uniform float u_pointsize;
uniform float u_near;
uniform float u_far;
uniform vec4 u_color;

layout(location = 0) in vec4 a_position;
//layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texCoord;
//layout(location = 3) in vec4 a_color;
out vec4 v_color;

void main() {
	vec4 worldpos = vec4(a_position.xyz, 1.);
    vec4 viewpos = u_viewmatrix * worldpos;
    gl_Position = u_projmatrix * viewpos;
	
	//float camDist = length(viewpos.xyz);
    //gl_PointSize = u_pointsize/camDist;
    // ortho
    float dist = -viewpos.z;
    // linear depth
    float ld = (dist - u_near) / (u_far - u_near);
    // linear nearness
    float ln = 1.-ld;
    // expo nearness
    float en = sqrt(ln);

	// camera's point density is a function of distance, 
    // so maybe we can scale points up as they get further away?
    // width of pt 2x distance is 1/2 as big
    // we want to counter-act that so that points get *bigger* as they get further away
    // beacuse they are less dense
    gl_PointSize = u_pointsize * dist;

	v_color = vec4(1.);
	//v_color = vec4(a_texCoord, 0.5, 1.);
	//v_color = vec4(a_normal*0.5+0.5, 1.);
	v_color = u_color;

	v_color *= vec4(en);
}