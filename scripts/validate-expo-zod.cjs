const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');

const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliPackagePath = expoRequire.resolve('@expo/cli/package.json');
const cliRequire = createRequire(cliPackagePath);
const serverDirectory = path.join(
  path.dirname(cliPackagePath),
  'build/src/start/server',
);
const { z } = cliRequire('zod');
const { PluginSchema, DevToolsPluginOutputSchema } = require(
  path.join(serverDirectory, 'DevToolsPlugin.schema.js'),
);
const { createMCPDevToolsExtensionSchema } = require(
  path.join(serverDirectory, 'createMCPDevToolsExtensionSchema.js'),
);
const { addMcpCapabilities } = require(
  path.join(serverDirectory, 'MCPDevToolsPluginCLIExtensions.js'),
);

async function validate() {
  assert.equal(cliRequire('zod/package.json').version, '4.6.7');
  const plugin = {
    packageName: 'validation-plugin',
    packageRoot: process.cwd(),
    cliExtensions: {
      description: 'Validation commands',
      entryPoint: 'unused.js',
      commands: [
        {
          name: 'inspect',
          title: 'Inspect',
          environments: ['cli', 'mcp'],
          parameters: [
            { name: 'label', type: 'text' },
            { name: 'count', type: 'number' },
            { name: 'confirmed', type: 'confirm' },
          ],
        },
        { name: 'local', title: 'Local only', environments: ['cli'] },
      ],
    },
  };
  const parsedPlugin = PluginSchema.parse(plugin);
  assert.ok(
    Object.isFrozen(parsedPlugin.cliExtensions.commands[0].environments),
  );
  assert.equal(
    PluginSchema.safeParse({ ...plugin, packageName: '' }).success,
    false,
  );
  const output = [
    { type: 'text', text: 'Ready', level: 'info' },
    { type: 'image', url: 'https://example.com/image.png' },
    { type: 'audio', url: 'https://example.com/audio.mp3' },
  ];
  assert.deepEqual(DevToolsPluginOutputSchema.parse(output), output);
  const invalidOutput = DevToolsPluginOutputSchema.safeParse([
    { type: 'image', url: 'not-a-url' },
  ]);
  assert.equal(invalidOutput.success, false);
  assert.ok(
    invalidOutput.error.issues.map((issue) => issue.message).join(', '),
  );

  const schema = createMCPDevToolsExtensionSchema(parsedPlugin);
  assert.equal(
    schema.safeParse({
      command: 'inspect',
      label: 'Test',
      count: 2,
      confirmed: true,
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ command: 'inspect', count: 'two' }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ command: 'inspect', unknown: true }).success,
    false,
  );
  assert.equal(schema.safeParse({ command: 'missing' }).success, false);
  const jsonSchema = z.toJSONSchema(schema);
  assert.equal(jsonSchema.additionalProperties, false);
  assert.deepEqual(jsonSchema.properties.command.enum, ['inspect', 'local']);
  assert.equal(jsonSchema.properties.count.type, 'number');

  let registrations = 0;
  await addMcpCapabilities(
    {
      registerTool(name, options, handler) {
        registrations += 1;
        assert.equal(name, plugin.packageName);
        assert.equal(typeof handler, 'function');
        const parameters = options.inputSchema.parameters;
        assert.equal(
          parameters.safeParse({ command: 'inspect' }).success,
          true,
        );
        assert.equal(parameters.safeParse({ command: 'local' }).success, false);
        assert.deepEqual(z.toJSONSchema(parameters).properties.command.enum, [
          'inspect',
        ]);
      },
    },
    {
      devtoolsPluginManager: { queryPluginsAsync: async () => [parsedPlugin] },
    },
  );
  assert.equal(registrations, 1);
  console.log(
    'Expo CLI Zod 4.6.7 schemas, validation errors, JSON schemas and MCP registration passed.',
  );
}

validate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
