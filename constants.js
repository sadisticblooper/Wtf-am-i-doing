// Maps Bone IDs (from the binary file) to Bone Names (in the skeleton hierarchy)
export const BONE_MAP = {
  0: "pelvis", 1: "stomach", 2: "chest", 3: "neck", 4: "head", 5: "hair", 6: "hair1",
  7: "zero_joint_hand_l", 8: "clavicle_l", 9: "arm_l", 10: "forearm_l",
  11: "forearm_twist_l", 12: "hand_l", 13: "weapon_l", 14: "f_big1_l", 15: "f_big2_l", 16: "f_big3_l",
  17: "f_main1_l", 18: "f_main2_l", 19: "f_main3_l", 20: "f_pointer1_l", 21: "f_pointer2_l", 22: "f_pointer3_l",
  23: "scapular_l", 24: "chest_l", 25: "zero_joint_hand_r", 26: "clavicle_r", 27: "arm_r", 28: "forearm_r",
  29: "forearm_twist_r", 30: "hand_r", 31: "weapons_r", 32: "f_big1_r", 33: "f_big2_r", 34: "f_big3_r",
  35: "f_main1_r", 36: "f_main2_r", 37: "f_main3_r", 38: "f_pointer1_r", 39: "f_pointer2_r", 40: "f_pointer3_r",
  41: "scapular_r", 42: "chest_r", 43: "zero_joint_pelvis_l", 44: "thigh_l", 45: "calf_l", 46: "foot_l",
  47: "toe_l", 48: "back_l", 49: "chest_h_49", 50: "stomach_h_50",
  51: "zero_joint_pelvis_r", 52: "thigh_r", 53: "calf_r", 54: "foot_r", 55: "toe_r", 56: "back_r",
  57: "biceps_twist_l", 58: "biceps_twist_r", 59: "thigh_twist_l", 60: "thigh_twist_r",
  61: "foot_r_extra", 62: "toe_r_extra", 63: "weapon_r_extra", 64: "weapon_l_extra", 65: "root_extra",
};

// Hardcoded skeleton hierarchy string
export const SKELETON_DEFINITION = `
"pelvis" [BONE] | G.Pos:(-105.750, 80.938, -7.070) | G.Rot (quat):(0.0196, -0.2812, -0.0333, 0.9589)
  "zero_joint_pelvis_l" [BONE] | G.Pos:(-105.750, 80.938, -7.070) | G.Rot (quat):(0.0196, -0.2812, -0.0333, 0.9589)
    "thigh_l" [BONE] | G.Pos:(-114.096, 82.097, -10.787) | G.Rot (quat):(0.0530, -0.6905, -0.0457, 0.7199)
      "calf_l" [BONE] | G.Pos:(-148.211, 49.767, 3.287) | G.Rot (quat):(0.0499, 0.5731, 0.0009, 0.8180)
        "foot_l" [BONE] | G.Pos:(-152.879, 12.394, -13.223) | G.Rot (quat):(0.0001, -0.3406, -0.0001, 0.9402)
          "toe_l" [BONE] | G.Pos:(-165.312, 2.301, -0.156) | G.Rot (quat):(-0.0032, -0.3406, -0.0013, 0.9402)
      "thigh_twist_l" [BONE] | G.Pos:(-126.585, 69.701, -6.025) | G.Rot (quat):(-0.0305, 0.8869, -0.0166, -0.4607)
    "back_l" [BONE] | G.Pos:(-109.283, 77.661, -19.888) | G.Rot (quat):(0.0238, -0.1512, -0.0304, 0.9878)
  "stomach" [BONE] | G.Pos:(-105.452, 91.816, -5.262) | G.Rot (quat):(-0.0167, -0.3092, -0.0043, 0.9508)
    "chest" [BONE] | G.Pos:(-104.960, 109.559, -5.274) | G.Rot (quat):(-0.0174, -0.2968, 0.0531, 0.9533)
      "zero_joint_hand_l" [BONE] | G.Pos:(-104.960, 109.559, -5.274) | G.Rot (quat):(-0.0174, -0.2968, 0.0531, 0.9533)
        "chest_l" [BONE] | G.Pos:(-123.178, 114.886, 4.693) | G.Rot (quat):(-0.0174, -0.2968, 0.0531, 0.9533)
        "clavicle_l" [BONE] | G.Pos:(-111.292, 133.672, -3.881) | G.Rot (quat):(0.0262, -0.3800, 0.0353, 0.9240)
          "arm_l" [BONE] | G.Pos:(-124.895, 127.953, -14.988) | G.Rot (quat):(-0.0359, -0.7193, 0.0311, 0.6930)
            "biceps_twist_l" [BONE] | G.Pos:(-129.133, 115.620, -19.839) | G.Rot (quat):(0.0489, -0.4303, 0.0512, 0.8999)
            "forearm_l" [BONE] | G.Pos:(-133.711, 102.290, -25.084) | G.Rot (quat):(-0.0730, 0.6346, -0.1745, 0.7493)
              "hand_l" [BONE] | G.Pos:(-151.939, 93.721, -10.975) | G.Rot (quat):(-0.3415, 0.1696, -0.1750, 0.9077)
                "f_big1_l" [BONE] | G.Pos:(-155.718, 97.132, -7.692) | G.Rot (quat):(-0.4253, 0.1070, -0.0275, 0.8983)
                  "f_big2_l" [BONE] | G.Pos:(-157.912, 97.698, -4.502) | G.Rot (quat):(-0.0922, -0.2801, 0.2271, 0.9282)
                    "f_big3_l" [BONE] | G.Pos:(-159.856, 94.621, -2.271) | G.Rot (quat):(0.4373, -0.3483, 0.4819, 0.6747)
                "f_pointer1_l" [BONE] | G.Pos:(-163.386, 95.563, -8.128) | G.Rot (quat):(-0.4550, 0.6761, -0.1906, 0.5473)
                  "f_pointer2_l" [BONE] | G.Pos:(-163.214, 94.173, -3.901) | G.Rot (quat):(-0.1801, -0.2028, 0.5427, 0.7949)
                    "f_pointer3_l" [BONE] | G.Pos:(-159.925, 95.151, -3.850) | G.Rot (quat):(-0.2902, 0.1603, 0.5199, 0.7872)
                "weapon_l" [BONE] | G.Pos:(-159.918, 92.167, -6.401) | G.Rot (quat):(-0.3776, -0.2048, -0.0341, 0.9024)
                "f_main1_l" [BONE] | G.Pos:(-162.706, 90.379, -9.055) | G.Rot (quat):(-0.1470, 0.8267, -0.5047, -0.2005)
                  "f_main2_l" [BONE] | G.Pos:(-160.501, 90.364, -4.597) | G.Rot (quat):(-0.3344, -0.2478, 0.4239, 0.8044)
                    "f_main3_l" [BONE] | G.Pos:(-156.227, 92.275, -5.487) | G.Rot (quat):(-0.2708, 0.2120, 0.7529, 0.5612)
              "forearm_twist_l" [BONE] | G.Pos:(-142.555, 98.127, -18.233) | G.Rot (quat):(-0.2090, 0.6352, -0.2051, 0.7146)
          "scapular_l" [BONE] | G.Pos:(-123.820, 135.762, -13.573) | G.Rot (quat):(0.0315, -0.5236, 0.0307, 0.8508)
      "zero_joint_hand_r" [BONE] | G.Pos:(-104.960, 109.558, -5.274) | G.Rot (quat):(-0.0229, -0.1942, 0.0510, 0.9794)
        "clavicle_r" [BONE] | G.Pos:(-107.850, 134.073, -1.510) | G.Rot (quat):(-0.1124, 0.8897, 0.2182, 0.3851)
          "arm_r" [BONE] | G.Pos:(-94.099, 133.060, 10.778) | G.Rot (quat):(0.0140, 0.6780, 0.0231, 0.7345)
            "biceps_twist_r" [BONE] | G.Pos:(-85.253, 122.926, 14.328) | G.Rot (quat):(-0.0157, 0.8573, 0.2003, 0.4740)
            "forearm_r" [BONE] | G.Pos:(-75.690, 111.971, 18.161) | G.Rot (quat):(-0.0542, 0.6369, 0.1581, 0.7527)
              "hand_r" [BONE] | G.Pos:(-97.553, 103.356, 25.405) | G.Rot (quat):(-0.1796, 0.7584, 0.0593, 0.6237)
                "weapon_r" [BONE] | G.Pos:(-106.350, 100.134, 24.666) | G.Rot (quat):(-0.1882, 0.9609, -0.0300, 0.2009)
                "f_pointer1_r" [BONE] | G.Pos:(-109.469, 103.124, 27.507) | G.Rot (quat):(-0.1277, 0.2454, 0.2590, 0.9254)
                  "f_pointer2_r" [BONE] | G.Pos:(-110.761, 101.110, 23.603) | G.Rot (quat):(0.1165, -0.4460, 0.2506, 0.8513)
                    "f_pointer3_r" [BONE] | G.Pos:(-108.026, 102.616, 22.071) | G.Rot (quat):(-0.2326, 0.8326, -0.1492, -0.4800)
                "f_big1_r" [BONE] | G.Pos:(-103.074, 105.795, 23.680) | G.Rot (quat):(-0.0521, -0.2608, 0.3611, 0.8938)
                  "f_big2_r" [BONE] | G.Pos:(-106.650, 105.385, 21.638) | G.Rot (quat):(-0.0098, -0.2876, 0.4809, 0.8282)
                    "f_big3_r" [BONE] | G.Pos:(-108.705, 101.246, 20.846) | G.Rot (quat):(-0.1364, -0.1250, 0.9134, 0.3627)
                "f_main1_r" [BONE] | G.Pos:(-107.275, 98.379, 28.389) | G.Rot (quat):(-0.0124, -0.0000, 0.2680, 0.9633)
                  "f_main2_r" [BONE] | G.Pos:(-107.160, 98.038, 23.672) | G.Rot (quat):(0.1957, -0.5238, 0.1873, 0.8076)
                    "f_main3_r" [BONE] | G.Pos:(-103.682, 100.473, 22.366) | G.Rot (quat):(-0.3849, 0.9121, -0.0674, -0.1245)
              "forearm_twist_r" [BONE] | G.Pos:(-86.304, 107.789, 21.672) | G.Rot (quat):(-0.1882, 0.8120, 0.0961, 0.5441)
          "scapular_r" [BONE] | G.Pos:(-98.689, 139.613, 10.348) | G.Rot (quat):(-0.1059, 0.8780, 0.2213, 0.4110)
        "chest_r" [BONE] | G.Pos:(-108.722, 116.571, 14.634) | G.Rot (quat):(-0.0229, -0.1942, 0.0510, 0.9794)
      "neck" [BONE] | G.Pos:(-109.693, 138.257, -3.259) | G.Rot (quat):(0.0133, -0.3673, 0.0633, 0.9279)
        "head" [BONE] | G.Pos:(-114.410, 150.565, 0.486) | G.Rot (quat):(-0.0088, -0.6652, -0.0368, 0.7457)
          "hair" [BONE] | G.Pos:(-111.927, 165.771, 1.155) | G.Rot (quat):(-0.0088, -0.6652, -0.0368, 0.7457)
  "zero_joint_pelvis_r" [BONE] | G.Pos:(-105.750, 80.937, -7.070) | G.Rot (quat):(0.0295, 0.0545, -0.0249, 0.9978)
    "thigh_r" [BONE] | G.Pos:(-98.825, 80.061, -1.062) | G.Rot (quat):(-0.2016, -0.0074, -0.0294, 0.9790)
      "thigh_twist_r" [BONE] | G.Pos:(-91.769, 65.774, 7.794) | G.Rot (quat):(-0.1614, -0.1410, 0.0105, 0.9767)
      "calf_r" [BONE] | G.Pos:(-79.871, 42.520, 24.212) | G.Rot (quat):(-0.0734, 0.2060, -0.0685, 0.9734)
        "foot_r" [BONE] | G.Pos:(-78.046, 12.250, -3.562) | G.Rot (quat):(-0.0060, -0.8463, 0.0119, 0.5326)
          "toe_r" [BONE] | G.Pos:(-70.829, 2.644, 13.255) | G.Rot (quat):(0.0453, 0.6014, 0.0107, 0.7976)
    "back_r" [BONE] | G.Pos:(-93.463, 75.551, -9.812) | G.Rot (quat):(0.0335, 0.9567, 0.0193, 0.2886)
`;

// Reverse mapping from name to ID
export const NAME_TO_ID = Object.entries(BONE_MAP).reduce((acc, [id, name]) => {
  acc[name] = parseInt(id);
  return acc;
}, {});