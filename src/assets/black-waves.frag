precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_volume;

float gradient(float p) {
    vec2 p0 = vec2(0.0,0.0);
    vec2 p1 = vec2(0.7,0.1);
    vec2 p2 = vec2(0.9,0.4);
    vec2 p3 = vec2(1.0 - 3.0 / min(u_resolution.x, u_resolution.y),1.25);
    vec2 p4 = vec2(1.0,0.0);
    if (p < p0.x) return p0.y;
    if (p < p1.x) return mix(p0.y, p1.y, (p-p0.x) / (p1.x-p0.x));
    if (p < p2.x) return mix(p1.y, p2.y, (p-p1.x) / (p2.x-p1.x));
    if (p < p3.x) return mix(p2.y, p3.y, (p-p2.x) / (p3.x-p2.x));
    if (p < p4.x) return mix(p3.y, p4.y, (p-p3.x) / (p4.x-p3.x));
    return p4.y;
}

float waveN(vec2 uv, float a, vec2 s, vec2 t, vec2 f, vec2 h) {
    float x = uv.x * 4.0 - 2.0;
    x = exp(-x * x);
    vec2 x1 = sin((u_time * 2.0 * s + t + uv.x) * f) * h * x * 2.0 * a;
    float g = gradient(uv.y / (0.5 + x1.x + x1.y));
    return g * 0.25 * x;
}

float wave1(vec2 uv, float a) {
    return waveN(uv, a, vec2(0.03,0.06), vec2(0.00,0.02), vec2(8.0,3.7), vec2(0.06,0.05));
}

float wave2(vec2 uv, float a) {
    return waveN(uv, a, vec2(0.04,0.07), vec2(0.16,-0.37), vec2(6.7,2.89), vec2(0.06,0.05));
}

float wave3(vec2 uv, float a) {
    return waveN(uv, a, vec2(0.035,0.055), vec2(-0.09,0.27), vec2(7.4,2.51), vec2(0.06,0.05));
}

float wave4(vec2 uv, float a) {
    return waveN(uv, a, vec2(0.032,0.09), vec2(0.08,-0.22), vec2(6.5,3.89), vec2(0.06,0.05));
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    
    float audio = u_volume * 2.0; // Amplify the volume for better effect
    float waves = wave1(uv, audio) + wave2(uv, audio) + wave3(uv, audio) + wave4(uv, audio);
    
    float x = uv.x;
    float y = 1.0 - uv.y;
    
    vec3 bg = mix(vec3(0.05,0.05,0.3), vec3(0.1,0.65,0.85), (x + y) * 0.55);
    vec3 ac = vec3(1.0 - waves);

    gl_FragColor = vec4(ac, 1.0);
}