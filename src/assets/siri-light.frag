precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_volume;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
    vec3 p3 = fract(p.xyx * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f *= f * (3.0 - 2.0 * f);
    float res = mix(
        mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
        mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1)), f.x), f.y);
    return res * res;    
}

float fbm(vec2 p) {
    return 0.6 * noise(p) + 0.3 * noise(p * 2.0);
}

vec3 pal(float t, vec3 a, vec3 b, vec3 d) {
    return a + b * (2.0 * (0.5 + 0.5 * cos(TAU * (t + d))) - 1.0);
}

void main() {
    float min_res = min(u_resolution.x, u_resolution.y);
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min_res * 1.1;
    float t = u_time;
    
    // Add volume influence
    float vol = u_volume * 2.0;
    t *= 1.0;

    float l = dot(uv, uv);
    gl_FragColor = vec4(1);
    if (l > 1.0) return;
    float r = 4.0 / min_res;
    float sm = smoothstep(1.0 + r, 1.0 - r, l);
    float sm2 = smoothstep(1.0, 1.0 - r * 2.0, l);
    float d = sm * l * l * l * 2.0;
    vec3 norm = normalize(vec3(uv, 1.0 - d));
    float a = atan(uv.y, uv.x) / TAU + t * 0.1;
    
    vec3 c = pal(a, vec3(0.3), vec3(0.3), vec3(0.0, 0.8, 0.8));
    c += l * max(0.0, l - 0.5 * dot(c, c));
    c += 0.3 * sqrt(noise(uv * 3.0 / (1.0 + norm.z * norm.z * norm.z * 2.0)));
    float f = fbm(normalize(uv + 1e-5) * 2. + t - sqrt(vol)) + 0.1;
    uv *= f + 0.1;
    uv *= 0.5;
    l = dot(uv, uv);
    vec3 ins = normalize(abs(c));
    float ind = 0.05 + smoothstep(0.0, 1.5, sqrt(l)) * 128.0;
    ind = 1.0 / ind;
    ins *= ind;
    float m = sm * smoothstep(0.7, 1.0, ind);
    c += ins * ins * m;
    c += abs(norm) * (1.0 - d) * 0.5;
    
    float alpha = mix(0.3, length(c) * 0.7, d) + m;
    gl_FragColor = vec4(mix(vec3(1), c, alpha * sm2), 1);
}