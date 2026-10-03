# SG PE Syllabus Bot

An AI assistant for Singapore primary PE teachers: it answers questions about the 2024 MOE PE Syllabus, grades pupils' movement from video, and runs a classroom workflow where pupils practise and assess each other in pairs.

## People

**Teacher**:
A signed-in PE teacher who plans lessons, reviews pupils' work and owns all student records.
_Avoid_: User, admin

**Pupil**:
An anonymous child taking part in a lesson on a shared device, known only by pair number and Apple/Banana label.
_Avoid_: Learner, kid, child, student (when no name is attached)

**Student**:
A named child the teacher keeps a record for; analyses and teacher assessments are filed under them.
_Avoid_: Pupil (when a name is attached), learner

## Classroom

**Class**:
A standing group of pupils, such as "4A", taught across many lessons.

**Lesson**:
One planned, dated PE period for a class, built by the teacher as an ordered list of lesson steps, with its own QR code and lesson pass.

**Lesson Step**:
One part of a lesson the teacher chooses and orders: a Teach, Practise or Assess step.
_Avoid_: Activity, component, lesson format

**Teach Step**:
A lesson step that shows pupils how a skill is done, through videos, pictures or its cues.

**Practise Step**:
A lesson step in which pupils carry out the skill.

**Assess Step**:
A lesson step that gathers evidence of pupils' performance by one assessment method.

**Assessment Method**:
How an assess step judges performance: AI analysis, peer assessment, or the teacher alone.

**Lesson Pass**:
The day's permission, carried in a lesson's QR code, that lets pupil devices use the classroom tools.

**Pair**:
Exactly two pupils who work together for a whole lesson, identified by a pair number; there are no trios.

**Apple / Banana**:
The fixed labels for the two pupils in a pair for a lesson (like "Pupil A" and "Pupil B").
_Avoid_: Partner 1/2

**Pair Assignment**:
The teacher's plan, made before a lesson, of which students form each pair and who is Apple and who is Banana.

**Performer**:
The pupil being filmed while doing a skill.

**Assessor**:
The pupil watching the performer and ticking cues; the two pupils in a pair take turns in each role.
_Avoid_: Coach, partner

**Check-in**:
A pair announcing it is present and ready (with a pair photo) before practice begins.
_Avoid_: Pair session

**Classroom Board**:
The teacher's live view of a lesson's pairs, check-ins and incoming work.
_Avoid_: Command Board, Teacher Board

**Review Tray**:
The part of the Classroom Board where the teacher works through pairs' submissions.
_Avoid_: Seesaw tray

**Practice Station**:
The pupil-facing name for an assess step that uses AI analysis: where a pupil gets an analysis of their clip, asks the AI about it, and sends it to the teacher.

**Practice Station Conversation**:
Everything a pupil asked the AI in the Practice Station and every answer it gave; the teacher can read all of it, the pupil is always told so, and it is filed under that student's record.

**Submission**:
The single piece of work a pair sends from the Practice Station in a lesson, holding both performers' work; resending it replaces it rather than adding another. It is locked once the teacher sets a final level, unless the teacher makes a redo request.

**Redo Request**:
A teacher asking a pair to send its submission again, which unlocks it.

## Skills and grading

**Primary Level**:
A pupil's year of primary school, P1 to P6.
_Avoid_: Level (alone), grade, year

**Learning Area**:
One of the MOE syllabus's broad strands of PE; this app covers Games and Sports, and Gymnastics.
_Avoid_: Skill area, Sports and Games

**Fundamental Movement Skills (FMS)**:
The basic Games and Sports skills taught in P1–P4, such as kicking or striking a stationary object with two hands.

**Game Category**:
A family of games taught from P5 that share tactics: net-barrier, striking-fielding or territorial-invasion.

**Games Concept**:
A tactical idea that transfers across games in a category, such as what an on-the-ball attacker should do.
_Avoid_: Tactic, strategy

**On-the-ball / Off-the-ball**:
Whether a player is the one with the ball or is moving to support or defend without it.

**Skill**:
One named movement within a learning area, such as Overhand Throw or Forward Roll.

**Criterion**:
One official MOE item a performance of a skill is judged against (gymnastics calls these "critical elements").
_Avoid_: Checklist item, teaching point

**Checklist**:
The full set of criteria for one skill.

**Cue**:
A child-friendly wording of a criterion that pupils tick while assessing each other.

**Proficiency Level**:
How well a skill was performed: Beginning, Developing, Competent or Accomplished.
_Avoid_: Excellent, Proficient

**Peer Assessment**:
An assessor ticking cues while watching the performer; the ticks are kept as evidence for the teacher's assessment but never set a level themselves.
_Avoid_: Peer feedback, peer coaching

**Analysis**:
The AI's reading of a clip of one person performing an FMS or gymnastics skill: which skill it shows, and its suggested grading against the checklist, judged from the video alone and never from pupils' cue ticks. Games concepts and partner skills (such as Partner Counterbalance) are never analysed.

**Teacher Assessment**:
The teacher's final judgement of a performance, criterion by criterion; the most important step.
_Avoid_: Teacher review

**Final Level**:
The proficiency level set in a teacher assessment; it is the grade of record, and the AI's level is only a suggestion. A teacher assessment may be made with or without a clip, and with or without a lesson.

**Current Level**:
A student's most recent final level for a skill; earlier final levels are kept as their progress over time.

**Rubric**:
The rule that turns met and missed criteria into a proficiency level.

**Custom Rubric**:
A teacher's own rubric for a skill, which replaces the standard one.

## Chat

**Conversation**:
One chat thread with the assistant, shown in the sidebar.
_Avoid_: Session (alone)
