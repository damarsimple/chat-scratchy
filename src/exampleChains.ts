/**
 * Pre-built Blockly XML example chains for the AI partner's add_example_chain tool.
 * The LLM references these by conceptName; the workspace injects the XML directly.
 */

export const EXAMPLE_CHAINS: Record<string, string> = {
  /** When flag clicked → repeat forever → move 10 steps + tiny wait */
  motion_loop: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="controls_whileUntil">
        <field name="MODE">WHILE</field>
        <value name="BOOL">
          <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
        </value>
        <statement name="DO">
          <block type="scratch_movesteps">
            <value name="STEPS">
              <block type="math_number"><field name="NUM">10</field></block>
            </value>
            <next>
              <block type="scratch_wait">
                <value name="SECONDS">
                  <block type="math_number"><field name="NUM">0.05</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
</xml>`,

  /** Two hat blocks: ArrowLeft → changeX -10, ArrowRight → changeX +10 */
  key_control: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenkeypressed" x="20" y="20">
    <field name="KEY">ArrowLeft</field>
    <next>
      <block type="scratch_changex">
        <value name="DX">
          <block type="math_number"><field name="NUM">-10</field></block>
        </value>
      </block>
    </next>
  </block>
  <block type="event_whenkeypressed" x="220" y="20">
    <field name="KEY">ArrowRight</field>
    <next>
      <block type="scratch_changex">
        <value name="DX">
          <block type="math_number"><field name="NUM">10</field></block>
        </value>
      </block>
    </next>
  </block>
  <block type="event_whenkeypressed" x="20" y="120">
    <field name="KEY">ArrowUp</field>
    <next>
      <block type="scratch_changey">
        <value name="DY">
          <block type="math_number"><field name="NUM">10</field></block>
        </value>
      </block>
    </next>
  </block>
  <block type="event_whenkeypressed" x="220" y="120">
    <field name="KEY">ArrowDown</field>
    <next>
      <block type="scratch_changey">
        <value name="DY">
          <block type="math_number"><field name="NUM">-10</field></block>
        </value>
      </block>
    </next>
  </block>
</xml>`,

  /** Flag → forever → move + if on edge bounce + wait */
  bounce_loop: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="controls_whileUntil">
        <field name="MODE">WHILE</field>
        <value name="BOOL">
          <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
        </value>
        <statement name="DO">
          <block type="scratch_movesteps">
            <value name="STEPS">
              <block type="math_number"><field name="NUM">5</field></block>
            </value>
            <next>
              <block type="scratch_ifonedgebounce">
                <next>
                  <block type="scratch_wait">
                    <value name="SECONDS">
                      <block type="math_number"><field name="NUM">0.02</field></block>
                    </value>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
</xml>`,

  /** Flag → forever → if touching mouse then say "Hi!" + wait */
  if_sensing: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="controls_whileUntil">
        <field name="MODE">WHILE</field>
        <value name="BOOL">
          <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
        </value>
        <statement name="DO">
          <block type="controls_if">
            <value name="IF0">
              <block type="scratch_touchingmouse"/>
            </value>
            <statement name="DO0">
              <block type="scratch_says">
                <value name="TEXT">
                  <block type="text"><field name="TEXT">Hi! 👋</field></block>
                </value>
              </block>
            </statement>
            <next>
              <block type="scratch_wait">
                <value name="SECONDS">
                  <block type="math_number"><field name="NUM">0.05</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
</xml>`,

  /** Flag → ask question → if answer equals 4 → say correct */
  ask_answer: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="scratch_askandwait">
        <value name="QUESTION">
          <block type="text"><field name="TEXT">What is 2 + 2?</field></block>
        </value>
        <next>
          <block type="controls_if">
            <value name="IF0">
              <block type="logic_compare">
                <field name="OP">EQ</field>
                <value name="A">
                  <block type="scratch_answer"/>
                </value>
                <value name="B">
                  <block type="text"><field name="TEXT">4</field></block>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="scratch_says">
                <value name="TEXT">
                  <block type="text"><field name="TEXT">Correct! 🎉</field></block>
                </value>
              </block>
            </statement>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`,

  /** Two stacks: flag → broadcast; when I receive → say */
  broadcast_receive: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="scratch_broadcast">
        <value name="MESSAGE">
          <block type="text"><field name="TEXT">start</field></block>
        </value>
      </block>
    </next>
  </block>
  <block type="scratch_whenireceive" x="20" y="130">
    <value name="MESSAGE">
      <block type="text"><field name="TEXT">start</field></block>
    </value>
    <next>
      <block type="scratch_says">
        <value name="TEXT">
          <block type="text"><field name="TEXT">Message received! 📢</field></block>
        </value>
      </block>
    </next>
  </block>
</xml>`,

  /** Flag → forever → next costume + wait (animation) */
  animation_loop: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="controls_whileUntil">
        <field name="MODE">WHILE</field>
        <value name="BOOL">
          <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
        </value>
        <statement name="DO">
          <block type="scratch_nextcostume">
            <next>
              <block type="scratch_wait">
                <value name="SECONDS">
                  <block type="math_number"><field name="NUM">0.2</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
</xml>`,

  /** Flag → forever → glide to x:100 → glide to x:-100 (pendulum) */
  glide_loop: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="event_whenflagclicked" x="20" y="20">
    <next>
      <block type="controls_whileUntil">
        <field name="MODE">WHILE</field>
        <value name="BOOL">
          <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
        </value>
        <statement name="DO">
          <block type="scratch_glide">
            <value name="SECS">
              <block type="math_number"><field name="NUM">1</field></block>
            </value>
            <value name="X">
              <block type="math_number"><field name="NUM">100</field></block>
            </value>
            <value name="Y">
              <block type="math_number"><field name="NUM">0</field></block>
            </value>
            <next>
              <block type="scratch_glide">
                <value name="SECS">
                  <block type="math_number"><field name="NUM">1</field></block>
                </value>
                <value name="X">
                  <block type="math_number"><field name="NUM">-100</field></block>
                </value>
                <value name="Y">
                  <block type="math_number"><field name="NUM">0</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
</xml>`,
};

export type ExampleConceptName = keyof typeof EXAMPLE_CHAINS;
