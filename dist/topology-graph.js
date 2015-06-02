module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
      options: {
        separator: ';'
      },
      dist: {
        src: ['*.js'],
        dest: 'dist/topology-graph.js'
      }
    },
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
      },
      dist: {
        files: {
          'dist/topology-graph.min.js': ['<%= concat.dist.dest %>']
        }
      }
    },
    qunit: {
      files: ['test/**/*.html']
    },
    jshint: {
      files: ['Gruntfile.js', 'src/**/*.js', 'test/**/*.js'],
      options: {
        // options here to override JSHint defaults
        globals: {
          define: true,
          console: true,
          document: true
        }
      }
    },
    watch: {
      files: ['<%= jshint.files %>'],
      tasks: ['jshint', 'qunit'],
      css: {
        files: 'styles/*.less',
        tasks: ['less']
      },
      js: {
        files: [
          'topology-graph.js',
          'topology-graph.css',
          'index.html'
        ],
        tasks: ['build']
      }
    },
    // The actual grunt server settings
    connect: {
      options: {
        protocol: grunt.option('scheme') || 'http',
        port: grunt.option('port') || 9000,
        hostname: grunt.option('hostname') || 'localhost'
      },
      server: {}
    },
  });

  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('serve', [
    'less',
    'build',
    'connect:server',
    "watch"
  ]);

  grunt.registerTask('build', [
    'concat',
    'uglify',
    'jshint'
  ]);

  grunt.registerTask('default', ['serve']);

};
;/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2015 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

(function(root, factory) {
    if (typeof(define) === 'function' && define.amd) {
	define(["./angular", "./d3" ], factory);
    } else {
	factory(root.angular, root.d3);
    }
}(this, function(angular, d3) {
    "use strict";

    function topology_graph(selector, notify) {
        var outer = d3.select(selector);

        /* Kinds of objects to show */
        var kinds = null;

        /* Data we've been fed */
        var items = { };
        var relations = [ ];

        /* Cached information */
        var width;
        var height;
        var nodes = [];
        var links = [];
        var lookup = { };

        var force = d3.layout.force()
            .charge(-800)
            .gravity(0.2)
            .linkDistance(80);

        var drag = force.drag();

        var svg = outer.append("svg").attr("class", "kube-topology");

        var node = d3.select();
        var link = d3.select();

        force.on("tick", function() {
            link.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
        });

        drag
            .on("dragstart", function(d) {
                notify(d);
                svg.selectAll("g").classed("selected", false);
                d3.select(this).classed("selected", true);

                if (d.fixed !== true)
                    d.floatpoint = [ d.x, d.y ];
                d.fixed = true;
                d3.select(this).classed("fixed", true);
            })
            .on("dragend", function(d) {
                var moved = true;
                if (d.floatpoint) {
                    moved = (d.x < d.floatpoint[0] - 5 || d.x > d.floatpoint[0] + 5) ||
                            (d.y < d.floatpoint[1] - 5 || d.y > d.floatpoint[1] + 5);
                    delete d.floatpoint;
                }
                d.fixed = moved && d.x > 3 && d.x < (width - 3) && d.y >= 3 && d.y < (height - 3);
                d3.select(this).classed("fixed", d.fixed);
            });

        svg
            .on("dblclick", function() {
                svg.selectAll("g")
                    .classed("fixed", false)
                    .each(function(d) { d.fixed = false; });
            })
            .on("click", function(ev) {
                if (!d3.select(d3.event.target).datum()) {
                    notify(null);
                    svg.selectAll("g").classed("selected", false);
                }
            });

        function icon(item) {
	    var text;
	    if (kinds)
		text = kinds[item.kind];
	    return text || "";
	}

        function weak(item) {
            if (item.status && item.status.phase && item.status.phase !== "Running")
                return true;
            return false;
        }

        function adjust() {
            force.size([width, height]);
            svg.attr("width", width).attr("height", height);
            update();
        }

        function update() {
            link = svg.selectAll("line")
                .data(links);

            link.exit().remove();
            link.enter().insert("line", ":first-child");

            link.attr("class", function(relation) { return relation.kinds; });

            node = svg.selectAll("g")
                .data(nodes, function(item) { return item.id; })
                .classed("weak", weak);

            node.exit().remove();

            var group = node.enter().append("g")
                .attr("class", function(item) { return item.kind; })
                .classed("weak", weak)
                .call(drag);

            group.append("circle")
                .attr("r", 15);
            group.append("text")
                .attr("y", 6)
                .text(icon);
            group.append("title")
                .text(function(item) { return item.metadata.name; });

            force
                .nodes(nodes)
                .links(links)
                .start();
        }

        function digest() {
            var pnodes = nodes;
            var plookup = lookup;

            /* The actual data for the graph */
            nodes = [];
            links = [];
            lookup = { };

            var item, id, kind, old;
            for (id in items) {
                item = items[id];
                kind = item.kind;

                /* Continue the d3 force layout tradition of modifying items */
                item.id = id;

                /* Requesting to only show certain kinds */
                if (kinds && !kinds[kind])
                    continue;

                /* Prevents flicker */
                old = pnodes[plookup[id]];
                if (old) {
                    item.x = old.x;
                    item.y = old.y;
                    item.px = old.px;
                    item.py = old.py;
                    item.fixed = old.fixed;
                    item.weight = old.weight;
                }

                lookup[id] = nodes.length;
                nodes.push(item);
            }

            var i, len, relation, s, t;
            for (i = 0, len = relations.length; i < len; i++) {
                relation = relations[i];

                s = lookup[relation.source];
                t = lookup[relation.target];
                if (s === undefined || t === undefined)
                    continue;

                links.push({ source: s, target: t, kinds: kinds });
            }

            update();
        }

        function resized() {
            width = outer.node().clientWidth;
            height = window.innerHeight - 15;
            adjust();
        }

        window.addEventListener('resize', resized);
        resized();

        return {
            kinds: function(value) {
                if (arguments.length === 0)
                    return kinds;
                kinds = value;
                digest();
            },
	    data: function(new_items, new_relations) {
                if (arguments.length === 0)
                    return [items, relations];
                items = new_items || { };
                relations = new_relations || [];
                digest();
            },
            close: function() {
	        window.removeEventListener('resize', resized);
            }
        };
    }

    /* The kubernetesUI component is quite loosely bound, define if it doesn't exist */
    try { angular.module("kubernetesUI"); } catch(e) { angular.module("kubernetesUI", []); }

    return angular.module('kubernetesUI', [ 'ngRoute', 'kubernetesUI' ])
        .directive('kubernetesTopologyGraph', [
            function() {
                return {
                    restrict: 'E',
                    scope: {
                        items: '=',
                        relations: '=',
                        kinds: '='
                    },
                    link: function($scope, element, attributes) {
                        element.css("display", "block");

                        function notify(item) {
                            $scope.$emit("selected", item);
                        }

                        var graph = topology_graph(element[0], notify);
                        graph.kinds($scope.kinds);

                        /* If there's a kinds in the current scope, watch it for changes */
                        $scope.$watchCollection("kinds", function(value) {
                            graph.kinds(value);
                        });

                        $scope.$watchGroup(["items", "relations"], function(values) {
                            graph.data(values[0], values[1]);
                        });

                        element.on("$destroy", function() {
                            graph.close();
                        });
                    }
                };
            }
        ]);
}));
