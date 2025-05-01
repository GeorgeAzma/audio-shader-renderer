precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_volume;

const float PI = 3.14159265358;

float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 perm(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

float noise(vec3 p) {
    vec3 a = floor(p);
    vec3 d = p - a;
    d = d * d * (3.0 - 2.0 * d);

    vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
    vec4 k1 = perm(b.xyxy);
    vec4 k2 = perm(k1.xyxy + b.zzww);

    vec4 c = k2 + a.zzzz;
    vec4 k3 = perm(c);
    vec4 k4 = perm(c + 1.0);

    vec4 o1 = fract(k3 * (1.0 / 41.0));
    vec4 o2 = fract(k4 * (1.0 / 41.0));

    vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
    vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

    return o4.y * d.y + o4.x * (1.0 - d.y);
}

float noiseStack(vec3 pos, int octaves, float falloff) {
    float n = noise(vec3(pos));
    float off = 1.0;
    if (octaves>1) {
        pos *= 2.0;
        off *= falloff;
        n = (1.0-off)*n + off*noise(vec3(pos));
    }
    if (octaves>2) {
        pos *= 2.0;
        off *= falloff;
        n = (1.0-off)*n + off*noise(vec3(pos));
    }
    if (octaves>3) {
        pos *= 2.0;
        off *= falloff;
        n = (1.0-off)*n + off*noise(vec3(pos));
    }
    return (1.0+n)/2.0;
}

vec2 noiseStackUV(vec3 pos, int octaves, float falloff, float diff) {
    float displaceA = noiseStack(pos, octaves, falloff);
    float displaceB = noiseStack(pos+vec3(3984.293,423.21,5235.19), octaves, falloff);
    return vec2(displaceA, displaceB);
}

void main() {
    float min_res = min(u_resolution.x, u_resolution.y);
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min_res;

    const float w = 0.05; // Line Width
    const vec3 c = vec3(0, 0.05, 1); // Line Color
    
    vec3 col = vec3(0);
    float audio = u_volume; // Using our volume uniform
    float y = sin((-u_time * 0.5 + uv.x) * PI) / (2.0 + uv.x * uv.x * 8.0) * audio;
    float vy = uv.y + 0.4;
    
    float d1 = smoothstep(w, 0.0, abs(vy - y));
    col += c * d1;
    col += d1 * d1 * d1 * d1 * 0.5;
    
    float d2 = smoothstep(w, 0.0, abs(vy + y));
    col += c * d2;
    col += d2 * d2 * d2 * d2 * 0.5;
    
    float d3 = smoothstep(w, 0.0, abs(vy - y * 0.5));
    col += c * d3 * 0.3;
    col += d3 * d3 * d3 * d3 * 0.2;
    
    float d4 = smoothstep(w, 0.0, abs(vy + y * 0.5));
    col += c * d4 * 0.3;
    col += d4 * d4 * d4 * d4 * 0.2;
    
    // Sparks
    const float up_flow = 8.0;
    float spark_grid_size = min_res / 20.0;
    float rt = u_time * 0.5;
    vec2 spark_uv = gl_FragCoord.xy - spark_grid_size * vec2(0, up_flow * rt);
    spark_uv -= spark_grid_size * noiseStackUV(0.01 * vec3(spark_uv, 30.0 * u_time), 1, 0.4, 0.1);
    if (mod(spark_uv.y / spark_grid_size, 2.0) < 1.0) spark_uv.x += 0.5 * spark_grid_size;
    vec2 spark_grid_idx = vec2(floor(spark_uv / spark_grid_size));
    float spark_random = rand(spark_grid_idx);
    float spark_life = min(10.0 * (1.0 - min((spark_grid_idx.y) / (24.0 - 20.0 * spark_random), 1.0)), 1.0) * (0.6 + 0.45 * audio);
    vec3 sparks = vec3(0);
    if (spark_life > 0.0) {
        float spark_size = spark_random * 0.3;
        float spark_radians = 999.0 * spark_random * 2.0 * PI + 2.0 * u_time;
        vec2 spark_circular = vec2(sin(spark_radians), cos(spark_radians));
        vec2 spark_off = (0.5 - spark_size) * spark_grid_size * spark_circular;
        vec2 spark_modulus = mod(spark_uv + spark_off, spark_grid_size) - 0.5 * vec2(spark_grid_size);
        float spark_length = length(spark_modulus);
        float sparks_gray = max(0.0, 1.0 - spark_length / (spark_size * spark_grid_size));
        sparks = spark_life * sparks_gray * c + pow(spark_life * sparks_gray, 4.0);
    }
    sparks *= smoothstep(-0.4, -0.0, uv.y);
    sparks *= smoothstep(1.0, 0.0, uv.y);
    col += sparks;
    
    col *= 1.0 - abs(gl_FragCoord.x / u_resolution.x * 2.0 - 1.0);

    gl_FragColor = vec4(col, 1.0);
}