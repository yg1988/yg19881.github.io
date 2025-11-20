const programs = [
    {
        program: "4-7-8 Relax",
        description: "A relaxing breath pattern to reduce anxiety and aid sleep.",
        levels: [
            {
                level: "Beginner",
                cycles: 4,
                sequence: [
                    { step: "Inhale", duration: 4 },
                    { step: "Retain", duration: 7 },
                    { step: "Exhale", duration: 8 },
                    { step: "Sustain", duration: 0 }
                ]
            },
            {
                level: "Advanced",
                cycles: 8,
                sequence: [
                    { step: "Inhale", duration: 4 },
                    { step: "Retain", duration: 7 },
                    { step: "Exhale", duration: 8 },
                    { step: "Sustain", duration: 0 }
                ]
            }
        ]
    },
    {
        program: "Box Breathing",
        description: "Focus and stress relief used by Navy SEALs.",
        levels: [
            {
                level: "Standard",
                cycles: 4,
                sequence: [
                    { step: "Inhale", duration: 4 },
                    { step: "Retain", duration: 4 },
                    { step: "Exhale", duration: 4 },
                    { step: "Sustain", duration: 4 }
                ]
            },
            {
                level: "Extended",
                cycles: 6,
                sequence: [
                    { step: "Inhale", duration: 5 },
                    { step: "Retain", duration: 5 },
                    { step: "Exhale", duration: 5 },
                    { step: "Sustain", duration: 5 }
                ]
            }
        ]
    },
    {
        program: "Coherent Breathing",
        description: "Balances the autonomic nervous system.",
        levels: [
            {
                level: "Standard",
                cycles: 10,
                sequence: [
                    { step: "Inhale", duration: 6 },
                    { step: "Retain", duration: 0 },
                    { step: "Exhale", duration: 6 },
                    { step: "Sustain", duration: 0 }
                ]
            }
        ]
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { programs };
} else {
    window.BREATHING_PROGRAMS = programs;
}
