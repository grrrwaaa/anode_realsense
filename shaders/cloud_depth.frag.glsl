#version 330
precision mediump float;

in vec4 v_color;
layout(location = 0) out vec4 frag_out0;

void main() {
	float d = length(abs(0.5-gl_PointCoord));
    if (d >= 0.5) discard; 

    frag_out0 = v_color;
}